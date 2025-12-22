import { connectToDB } from "./client";

export async function initMongoDB() {
  try {
    await connectToDB();
  } catch (error) {
    throw error
  }
}
