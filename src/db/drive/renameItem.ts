import { drive } from "./client";
import { getAuth } from "./auth";

export async function renameItem(
  fileId: string,
  newName: string,
): Promise<void> {
  await getAuth();
  await drive.files.update({ fileId, requestBody: { name: newName } });
}
