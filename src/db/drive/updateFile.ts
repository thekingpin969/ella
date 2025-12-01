import { drive } from "./client";
import { getAuth } from "./auth";

export async function updateFile(
  fileId: string,
  content: string,
  mimeType = "text/plain",
): Promise<void> {
  await getAuth();
  const media = { mimeType, body: content };
  await drive.files.update({ fileId, media });
}
