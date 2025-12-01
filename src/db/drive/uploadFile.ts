import { drive } from "./client";
import { getAuth } from "./auth";
import { readFileSync } from "fs";
import { drive_v3 } from "googleapis";

export async function uploadFile(
  filePath: string,
  fileName: string,
  mimeType: string,
  parentId: string | null = null,
): Promise<string> {
  await getAuth();
  const metadata: drive_v3.Schema$File = {
    name: fileName,
    ...(parentId && { parents: [parentId] }),
  };
  const media = { mimeType, body: readFileSync(filePath) };
  const res = await drive.files.create({
    requestBody: metadata,
    media,
    fields: "id",
  });
  if (!res.data.id) {
    throw new Error("File upload failed, no ID returned.");
  }
  return res.data.id;
}
