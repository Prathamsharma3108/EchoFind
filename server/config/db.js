
import { MongoClient } from 'mongodb';

let client;
let db;

export const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
      throw new Error('MONGODB_URI is missing from environment variables');
    }

    client = new MongoClient(uri);

    await client.connect();

    db = client.db('echofind');

    await db.command({ ping: 1 });

    console.log('MongoDB connected successfully');

    return db;
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    throw error;
  }
};

export const getDB = () => {
  if (!db) {
    throw new Error('Database not initialized. Connect to MongoDB first.');
  }

  return db;
};
