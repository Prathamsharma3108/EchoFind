
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

import { findMatches } from '../utils/matcher.js';
import { extractItemDetails } from '../services/gemini.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPORTS_FILE = path.join(__dirname, '../data/reports.json');

// Read reports from JSON storage
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

// Save reports to JSON storage
async function saveReports(reports) {
  await fs.writeFile(
    REPORTS_FILE,
    JSON.stringify(reports, null, 2),
    'utf-8'
  );
}

// GET /api/reports
router.get('/', async (req, res, next) => {
  try {
    const reports = await getReports();

    res.status(200).json({
      success: true,
      count: reports.length,
      reports
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/reports
router.post('/', async (req, res, next) => {
  try {
    const {
      type,
      transcript,
      itemName,
      category,
      color,
      description,
      location,
      reportedAt
    } = req.body || {};

    // Validate report type
    if (
      typeof type !== 'string' ||
      !['LOST', 'FOUND'].includes(type.trim().toUpperCase())
    ) {
      return res.status(400).json({
        success: false,
        message: 'Type must be LOST or FOUND'
      });
    }

    const normalizedType = type.trim().toUpperCase();

    let itemDetails;

    // If a voice transcript is provided, extract details using Gemini
    if (transcript !== undefined) {
      if (
        typeof transcript !== 'string' ||
        !transcript.trim() ||
        transcript.trim().length > 2000
      ) {
        return res.status(400).json({
          success: false,
          message: 'Transcript must be a non-empty string under 2000 characters'
        });
      }

      itemDetails = await extractItemDetails(
        transcript.trim(),
        normalizedType
      );
    } else {
      // Manual report submission remains supported
      itemDetails = {
        itemName,
        category,
        color,
        description,
        location,
        reportedAt
      };
    }

    // Validate extracted or manually supplied item name
    if (
      typeof itemDetails.itemName !== 'string' ||
      !itemDetails.itemName.trim() ||
      itemDetails.itemName.trim().length > 100
    ) {
      return res.status(400).json({
        success: false,
        message: 'Item name is required and must be under 100 characters'
      });
    }

    // Validate optional text fields
    const optionalFields = {
      category: itemDetails.category,
      color: itemDetails.color,
      description: itemDetails.description,
      location: itemDetails.location
    };

    for (const [field, value] of Object.entries(optionalFields)) {
      if (value !== undefined && value !== null && typeof value !== 'string') {
        return res.status(400).json({
          success: false,
          message: `${field} must be a string`
        });
      }
    }

    // Validate reported date
    const extractedDate = itemDetails.reportedAt;

    if (
      extractedDate !== undefined &&
      extractedDate !== null &&
      (
        typeof extractedDate !== 'string' ||
        Number.isNaN(Date.parse(extractedDate))
      )
    ) {
      return res.status(400).json({
        success: false,
        message: 'reportedAt must be a valid date'
      });
    }

    // Create report
    const newReport = {
      id: randomUUID(),
      type: normalizedType,
      itemName: itemDetails.itemName.trim(),
      category: itemDetails.category?.trim() || 'unknown',
      color: itemDetails.color?.trim() || 'unknown',
      description: itemDetails.description?.trim() || '',
      location: itemDetails.location?.trim() || 'unknown',
      reportedAt: extractedDate || null,
      createdAt: new Date().toISOString(),
      status: 'OPEN'
    };

    const reports = await getReports();

    // Save the new report
    reports.push(newReport);
    await saveReports(reports);

    // Find matching reports
    const matches = findMatches(newReport, reports);

    res.status(201).json({
      success: true,
      message: 'Report created successfully',
      report: newReport,
      matches
    });

  } catch (error) {
    next(error);
  }
});

export default router;
