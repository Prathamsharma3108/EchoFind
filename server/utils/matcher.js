
function normalize(value) {
  if (typeof value !== 'string') return '';

  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getWords(value) {
  return new Set(normalize(value).split(' ').filter(Boolean));
}

function getWordOverlap(text1, text2) {
  const words1 = getWords(text1);
  const words2 = getWords(text2);

  if (!words1.size || !words2.size) return 0;

  let commonWords = 0;

  for (const word of words1) {
    if (words2.has(word)) commonWords++;
  }

  return commonWords / Math.max(words1.size, words2.size);
}

function isSameDay(date1, date2) {
  const first = new Date(date1);
  const second = new Date(date2);

  if (
    Number.isNaN(first.getTime()) ||
    Number.isNaN(second.getTime())
  ) {
    return false;
  }

  return first.toISOString().slice(0, 10) ===
    second.toISOString().slice(0, 10);
}

export function findMatches(newReport, existingReports) {
  const matches = [];

  if (
    !newReport ||
    !['LOST', 'FOUND'].includes(newReport.type) ||
    !Array.isArray(existingReports)
  ) {
    return matches;
  }

  for (const report of existingReports) {
    // Only compare LOST against FOUND
    if (
      !report ||
      !['LOST', 'FOUND'].includes(report.type) ||
      newReport.type === report.type
    ) {
      continue;
    }

    if (report.status && report.status !== 'OPEN') {
      continue;
    }

    const itemName1 = normalize(newReport.itemName);
    const itemName2 = normalize(report.itemName);

    if (!itemName1 || !itemName2) continue;

    const nameSimilarity = getWordOverlap(itemName1, itemName2);

    const description1 = normalize(newReport.description);
    const description2 = normalize(report.description);

    const descriptionSimilarity = getWordOverlap(
      `${itemName1} ${description1}`,
      `${itemName2} ${description2}`
    );

    // Item identity is mandatory.
    // Category/location alone cannot create a match.
    const hasItemSimilarity =
      itemName1 === itemName2 ||
      nameSimilarity >= 0.5 ||
      descriptionSimilarity >= 0.5;

    if (!hasItemSimilarity) continue;

    let score = 0;
    const reasons = [];

    // Item identity: maximum 50 points
    if (itemName1 === itemName2) {
      score += 50;
      reasons.push('Exact item name match');
    } else {
      const namePoints = Math.round(nameSimilarity * 40);
      score += namePoints;
      reasons.push('Similar item names');
    }

    // Category: 15 points
    const category1 = normalize(newReport.category);
    const category2 = normalize(report.category);

    if (
      category1 &&
      category2 &&
      category1 !== 'unknown' &&
      category2 !== 'unknown' &&
      category1 === category2
    ) {
      score += 15;
      reasons.push('Same item category');
    }

    // Color: 15 points
    const color1 = normalize(newReport.color);
    const color2 = normalize(report.color);

    if (
      color1 &&
      color2 &&
      color1 !== 'unknown' &&
      color2 !== 'unknown' &&
      color1 === color2
    ) {
      score += 15;
      reasons.push('Same color');
    }

    // Location: maximum 20 points
    const location1 = normalize(newReport.location);
    const location2 = normalize(report.location);

    if (
      location1 &&
      location2 &&
      location1 !== 'unknown' &&
      location2 !== 'unknown'
    ) {
      if (
        location1.includes(location2) ||
        location2.includes(location1)
      ) {
        score += 20;
        reasons.push('Similar reported location');
      } else if (getWordOverlap(location1, location2) >= 0.5) {
        score += 10;
        reasons.push('Partially matching location');
      }
    }

    // Same reported day: 10 points
    if (
      newReport.reportedAt &&
      report.reportedAt &&
      isSameDay(newReport.reportedAt, report.reportedAt)
    ) {
      score += 10;
      reasons.push('Reported on the same day');
    }

    // Description similarity: maximum 10 points
    if (descriptionSimilarity >= 0.5) {
      score += 10;
      reasons.push('Similar item descriptions');
    }

    if (score >= 50) {
      matches.push({
        matchedReportId: report.id,
        score,
        reasons,
        reportDetails: report
      });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}
