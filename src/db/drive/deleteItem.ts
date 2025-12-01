import { drive } from "./client";
import { getAuth } from "./auth";

export async function deleteItem(fileId: string): Promise<void> {
  await getAuth();
  await drive.files.delete({ fileId });
}
