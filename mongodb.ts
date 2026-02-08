import mongoose from "mongoose";

export async function connectMongoDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is required");
  }
  
  await mongoose.connect(uri);
  // Connected message handled by startup summary in index.ts

  try {
    const db = mongoose.connection.db;
    if (db) {
      const usersCollection = db.collection("users");
      const indexes = await usersCollection.indexes();
      const staleIndex = indexes.find((idx: any) => idx.key?.username !== undefined);
      if (staleIndex && staleIndex.name) {
        await usersCollection.dropIndex(staleIndex.name);
        console.log("Dropped stale 'username' index from users collection");
      }
    }
  } catch (err: any) {
    if (err.code !== 27) {
      console.log("Index cleanup note:", err.message);
    }
  }
}

export { mongoose };
