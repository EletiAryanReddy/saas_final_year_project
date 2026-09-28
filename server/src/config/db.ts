import mongoose from 'mongoose';
import { env } from './env';

export async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri);
  console.log('[db] connected');
}
