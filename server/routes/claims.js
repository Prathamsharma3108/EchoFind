
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CLAIMS_FILE = path.join(__dirname, '../data/claims.json');
const REPORTS_FILE = path.join(__dirname, '../data/reports.json');

// Read claims from JSON storage
async function getClaims() {
  try {
    const data = await fs.readFile(CLAIMS_FILE, 'utf-8');
    const claims = JSON.parse(data);

    if (!Array.isArray(claims)) {
      throw new Error('Invalid claims database format');
    }

    return claims;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

// Save claims to JSON storage
async function saveClaims(claims) {
  await fs.writeFile(
    CLAIMS_FILE,
    JSON.stringify(claims, null, 2),
    'utf-8'
  );
}

// Read reports to verify that the claimed items exist
async function getReports() {
  try {
    const data = await fs.readFile(REPORTS_FILE, 'utf-8');
    const reports = JSON.parse(data);

    if (!Array.isArray(reports)) {
      throw new Error('Invalid reports database format');
    }

    return reports;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

// GET /api/claims
// Never expose contact information through this public endpoint.
router.get('/', async (req, res, next) => {
  try {
    const claims = await getClaims();

    const publicClaims = claims.map(
      ({ contact, ...claim }) => claim
    );

    res.status(200).json({
      success: true,
      count: publicClaims.length,
      claims: publicClaims
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/claims
router.post('/', async (req, res, next) => {
  try {
    const { lostItemId, foundItemId, contact } = req.body || {};

    // Validate required fields
    if (
      typeof lostItemId !== 'string' ||
      !lostItemId.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: 'Valid lostItemId is required'
      });
    }

    if (
      typeof foundItemId !== 'string' ||
      !foundItemId.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: 'Valid foundItemId is required'
      });
    }

    if (
      typeof contact !== 'string' ||
      !contact.trim() ||
      contact.trim().length > 200
    ) {
      return res.status(400).json({
        success: false,
        message: 'Contact information is required and must be under 200 characters'
      });
    }

    const cleanLostId = lostItemId.trim();
    const cleanFoundId = foundItemId.trim();
    const cleanContact = contact.trim();

    if (cleanLostId === cleanFoundId) {
      return res.status(400).json({
        success: false,
        message: 'Lost and found item IDs must be different'
      });
    }

    // Verify both reports exist and have the correct types
    const reports = await getReports();

    const lostReport = reports.find(
      report => report.id === cleanLostId
    );

    const foundReport = reports.find(
      report => report.id === cleanFoundId
    );

    if (!lostReport || lostReport.type !== 'LOST') {
      return res.status(404).json({
        success: false,
        message: 'Valid lost item report not found'
      });
    }

    if (!foundReport || foundReport.type !== 'FOUND') {
      return res.status(404).json({
        success: false,
        message: 'Valid found item report not found'
      });
    }

    if (
      lostReport.status !== 'OPEN' ||
      foundReport.status !== 'OPEN'
    ) {
      return res.status(400).json({
        success: false,
        message: 'One or both reports are no longer open'
      });
    }

    const claims = await getClaims();

    // Prevent duplicate pending claims for the same pair
    const duplicateClaim = claims.some(
      claim =>
        claim.lostItemId === cleanLostId &&
        claim.foundItemId === cleanFoundId &&
        claim.status === 'PENDING'
    );

    if (duplicateClaim) {
      return res.status(409).json({
        success: false,
        message: 'A pending claim already exists for these items'
      });
    }

    const newClaim = {
      id: randomUUID(),
      lostItemId: cleanLostId,
      foundItemId: cleanFoundId,
      contact: cleanContact,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };

    claims.push(newClaim);
    await saveClaims(claims);

    // Do not send private contact information back in the response
    const { contact: privateContact, ...publicClaim } = newClaim;

    res.status(201).json({
      success: true,
      message: 'Claim submitted successfully',
      claim: publicClaim
    });
  } catch (error) {
    next(error);
  }
});

export default router;
