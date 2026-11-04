
import { useState, useEffect, useRef } from 'react';
import './App.css';

const API_BASE_URL = 'https://echofind-api.onrender.com';
function App() {
  const [view, setView] = useState('home');
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);

  // Claim workflow states
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [contactInfo, setContactInfo] = useState('');
  const [claimStatus, setClaimStatus] = useState('idle');
  const [claimError, setClaimError] = useState('');

  const recognitionRef = useRef(null);

  // Initialize speech recognition
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let currentTranscript = '';

        for (let i = 0; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }

        setTranscript(currentTranscript);
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);

        if (event.error === 'not-allowed') {
          setError(
            'Microphone access denied. Please allow permissions in your browser.'
          );
        } else {
          setError(`Microphone error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  // Text-to-speech
  const announce = (message) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(message);
      window.speechSynthesis.speak(utterance);
    }
  };

  // Reset claim form
  const resetClaimState = () => {
    setSelectedMatchId(null);
    setContactInfo('');
    setClaimStatus('idle');
    setClaimError('');
  };

  // Open claim form and guide the user
  const handleOpenClaim = (matchId) => {
    resetClaimState();
    setSelectedMatchId(matchId);

    announce(
      'To submit a claim, please enter your email address or phone number. Your contact information will remain private.'
    );
  };

  // Start or stop voice recording
  const toggleRecording = () => {
    setError('');

    if (!recognitionRef.current) {
      setError(
        'Speech recognition is not supported in this browser. Please use Chrome or Edge.'
      );
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      setTranscript('');

      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (err) {
        console.error(err);
        setError('Failed to start microphone. Please try again.');
      }
    }
  };

  // Submit LOST or FOUND report
  const handleSubmit = async () => {
    if (!transcript.trim()) return;

    if (isRecording) {
      recognitionRef.current?.stop();
    }

    setIsLoading(true);
    setError('');
    setResults(null);
    resetClaimState();

    const reportType = view === 'reportLost' ? 'LOST' : 'FOUND';

    try {
      const response = await fetch(`${API_BASE_URL}/api/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: reportType,
          transcript: transcript,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || `Server error: ${response.statusText}`
        );
      }

      setResults(data);

      const matchCount = data.matches?.length || 0;

      let announcement =
        `Your ${reportType.toLowerCase()} item report has been submitted. `;

      if (matchCount > 0) {
        const bestMatch = data.matches[0].reportDetails;

        const itemName = bestMatch?.itemName || 'an item';
        const color = bestMatch?.color;
        const location = bestMatch?.location;

        announcement +=
          `We found ${matchCount} possible ${
            matchCount === 1 ? 'match' : 'matches'
          }. One possible match is ${color ? `${color} ` : ''}${itemName}.`;

        if (location) {
          announcement += ` It was reported near ${location}.`;
        }

        announcement +=
          ' You can review the match on your screen and submit a claim.';
      } else {
        announcement +=
          'We did not find any immediate matches, but we will keep checking.';
      }

      announce(announcement);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to connect to the backend.');
      announce('There was an error submitting your report.');
    } finally {
      setIsLoading(false);
    }
  };

  // Submit a claim for a matched item
  const submitClaim = async (matchedReport) => {
    if (claimStatus === 'loading' || claimStatus === 'success') return;

    if (!contactInfo.trim()) {
      setClaimError('Contact information is required.');
      return;
    }

    if (contactInfo.trim().length > 200) {
      setClaimError('Contact information must be under 200 characters.');
      return;
    }

    setClaimStatus('loading');
    setClaimError('');

    const newReport = results.report;

    // Determine the LOST and FOUND report IDs
    const lostItemId =
      newReport.type === 'LOST' ? newReport.id : matchedReport.id;

    const foundItemId =
      newReport.type === 'FOUND' ? newReport.id : matchedReport.id;

    try {
      const response = await fetch(`${API_BASE_URL}/api/claims`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lostItemId,
          foundItemId,
          contact: contactInfo.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error(
            'A pending claim already exists for this exact match.'
          );
        }

        throw new Error(data.message || 'Failed to submit claim.');
      }

      setClaimStatus('success');

      announce(
        'Your claim has been submitted and is pending review. Your contact information is kept private.'
      );
    } catch (err) {
      console.error(err);
      setClaimStatus('error');
      setClaimError(err.message);
      announce('There was an error submitting your claim.');
    }
  };

  // Return to home
  const handleReset = () => {
    recognitionRef.current?.abort();

    setView('home');
    setTranscript('');
    setResults(null);
    setError('');
    resetClaimState();
    setIsRecording(false);

    window.speechSynthesis.cancel();
  };

  // Home page
  const renderHome = () => (
    <div className="landing-container">
      <header className="hero-section">
        <h1 className="brand-title">EchoFind</h1>

        <p className="brand-tagline">
          Speak it. Find it. Get it back.
        </p>

        <p className="brand-description">
          The AI-powered platform that connects lost items with their owners
          using natural voice recognition.
        </p>
      </header>

      <div className="action-cards">
        <button
          className="card lost-card"
          onClick={() => setView('reportLost')}
        >
          <div className="card-icon">🔍</div>
          <h2>I Lost Something</h2>
          <p>Report a missing item</p>
        </button>

        <button
          className="card found-card"
          onClick={() => setView('reportFound')}
        >
          <div className="card-icon">✨</div>
          <h2>I Found Something</h2>
          <p>Help return an item</p>
        </button>
      </div>
    </div>
  );

  // Report page
  const renderReport = () => (
    <div className="report-container">
      <button
        className="back-button"
        onClick={handleReset}
        disabled={isLoading || claimStatus === 'loading'}
      >
        &larr; Back to Home
      </button>

      <h2 className="report-title">
        {view === 'reportLost' ? 'Report Lost Item' : 'Report Found Item'}
      </h2>

      {error && <div className="error-banner">⚠️ {error}</div>}

      {/* Results */}
      {results ? (
        <div className="results-view">
          <div className="success-banner">
            ✅ Report successfully analyzed and saved!
          </div>

          <div className="extracted-details">
            <h3>Extracted Item Details</h3>

            <ul>
              <li>
                <strong>Item:</strong>{' '}
                {results.report?.itemName || 'Unknown'}
              </li>
              <li>
                <strong>Category:</strong>{' '}
                {results.report?.category || 'Unknown'}
              </li>
              <li>
                <strong>Color:</strong>{' '}
                {results.report?.color || 'Unknown'}
              </li>
              <li>
                <strong>Location:</strong>{' '}
                {results.report?.location || 'Unknown'}
              </li>
              <li>
                <strong>Description:</strong>{' '}
                {results.report?.description || 'None provided'}
              </li>
            </ul>
          </div>

          {/* Potential matches */}
          <div className="matches-section">
            <h3>
              Potential Matches ({results.matches?.length || 0})
            </h3>

            {results.matches?.length > 0 ? (
              <ul className="match-list">
                {results.matches.map((match, idx) => (
                  <li
                    key={match.reportDetails?.id || idx}
                    className="match-card"
                  >
                    <h4>
                      {match.reportDetails?.itemName || 'Matched Item'}
                    </h4>

                    <p>
                      <strong>Color:</strong>{' '}
                      {match.reportDetails?.color || 'Unknown'}
                    </p>

                    <p>
                      <strong>Location:</strong>{' '}
                      {match.reportDetails?.location || 'Unknown'}
                    </p>

                    <p>
                      <strong>Description:</strong>{' '}
                      {match.reportDetails?.description || 'None'}
                    </p>

                    <div className="match-score">
                      Match Score: {match.score}
                    </div>

                    {/* Claim form */}
                    {selectedMatchId === match.reportDetails?.id ? (
                      <div
                        className="claim-workflow-area"
                        style={{
                          marginTop: '1rem',
                          borderTop:
                            '1px solid var(--border-color, #3f3f46)',
                          paddingTop: '1rem',
                        }}
                      >
                        {claimStatus === 'success' ? (
                          <div
                            className="success-banner"
                            style={{ marginBottom: 0 }}
                          >
                            ✅ Claim submitted! We will review and contact
                            you soon.
                          </div>
                        ) : (
                          <div className="transcript-box">
                            <label>
                              Contact Information (Email or Phone)
                            </label>

                            <textarea
                              value={contactInfo}
                              onChange={(e) =>
                                setContactInfo(e.target.value)
                              }
                              placeholder="How can we reach you about this item? (Kept private)"
                              rows="2"
                              disabled={claimStatus === 'loading'}
                            />

                            {claimError && (
                              <div
                                className="error-banner"
                                style={{
                                  padding: '0.5rem',
                                  marginTop: '0.5rem',
                                  fontSize: '0.9rem',
                                }}
                              >
                                ⚠️ {claimError}
                              </div>
                            )}

                            <div
                              style={{
                                display: 'flex',
                                gap: '1rem',
                                marginTop: '0.5rem',
                              }}
                            >
                              <button
                                className="submit-button"
                                style={{ margin: 0, flex: 1 }}
                                onClick={() =>
                                  submitClaim(match.reportDetails)
                                }
                                disabled={
                                  claimStatus === 'loading' ||
                                  !contactInfo.trim()
                                }
                              >
                                {claimStatus === 'loading'
                                  ? 'Submitting...'
                                  : 'Submit Claim'}
                              </button>

                              <button
                                className="back-button"
                                style={{ margin: 0 }}
                                onClick={resetClaimState}
                                disabled={claimStatus === 'loading'}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        className="claim-button"
                        onClick={() =>
                          handleOpenClaim(match.reportDetails.id)
                        }
                      >
                        Review & Claim
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="no-matches-text">
                No matches found at this time. Check back later.
              </p>
            )}
          </div>
        </div>
      ) : (
        /* Voice entry */
        <div className="voice-interface">
          <div
            className={`mic-button-container ${
              isRecording ? 'recording' : ''
            }`}
          >
            <button
              className={`mic-button ${isRecording ? 'pulse' : ''}`}
              onClick={toggleRecording}
              disabled={isLoading}
            >
              {isRecording ? '⏹️' : '🎙️'}
            </button>
          </div>

          <p className="instruction-text">
            {isRecording
              ? 'Listening... Tap to stop'
              : 'Tap microphone to speak'}
          </p>

          <div className="transcript-box">
            <label>Transcript:</label>

            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Your voice description will appear here... You can also type or edit it manually."
              rows="4"
              disabled={isLoading}
            />
          </div>

          <button
            className="submit-button"
            onClick={handleSubmit}
            disabled={!transcript.trim() || isRecording || isLoading}
          >
            {isLoading ? 'Analyzing with Gemini...' : 'Analyze & Submit'}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="app-theme-dark">
      <div className="app-wrapper">
        {view === 'home' ? renderHome() : renderReport()}
      </div>
    </div>
  );
}

export default App;
