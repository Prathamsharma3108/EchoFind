
import express from 'express';
import { randomUUID } from 'crypto';

import { getDB } from '../config/db.js';

const router = express.Router();

// GET /api/claims
// Never expose contact information through this public endpoint.
router.get('/', async (req, res, next) => {
  try {
    const claims = await getDB()
      .collection('claims')
      .find(
        {},
        { projection: { _id: 0, contact: 0 } }
      )
      .toArray();

    res.status(200).json({
      success: true,
      count: claims.length,
      claims
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

    const db = getDB();
    const reportsCollection = db.collection('reports');
    const claimsCollection = db.collection('claims');

    // Verify both reports exist and have correct types
    const lostReport = await reportsCollection.findOne({
      id: cleanLostId,
      type: 'LOST'
    });

    const foundReport = await reportsCollection.findOne({
      id: cleanFoundId,
      type: 'FOUND'
    });

    if (!lostReport) {
      return res.status(404).json({
        success: false,
        message: 'Valid lost item report not found'
      });
    }

    if (!foundReport) {
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

    // Prevent duplicate pending claims
    const duplicateClaim = await claimsCollection.findOne({
      lostItemId: cleanLostId,
      foundItemId: cleanFoundId,
      status: 'PENDING'
    });

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

    // Store claim in MongoDB
    await claimsCollection.insertOne(newClaim);

    // Never return private contact information
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
