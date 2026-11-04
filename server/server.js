
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import reportRoutes from './routes/reports.js';
import claimRoutes from './routes/claims.js';
import { connectDB } from './config/db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5050;

// Global middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'EchoFind API is running',
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api/reports', reportRoutes);
app.use('/api/claims', claimRoutes);

// 404 handler
app.use((req, res, next) => {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.status = 404;
  next(error);
});

// Centralized error handler
app.use((err, req, res, next) => {
  const statusCode =
    err.status ||
    (err instanceof SyntaxError && err.status === 400 ? 400 : 500);

  console.error(`[ERROR] ${statusCode}: ${err.message}`);

  res.status(statusCode).json({
    success: false,
    message: statusCode === 500
      ? 'Internal server error'
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && {
      stack: err.stack
    })
  });
});

// Connect to MongoDB before accepting requests
const startServer = async () => {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`EchoFind API running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start EchoFind:', error.message);
    process.exit(1);
  }
};

startServer();
