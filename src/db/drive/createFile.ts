import { drive } from "./client";
import { getAuth } from "./auth";
import { drive_v3 } from "googleapis";

export async function createFile(
  name: string,
  content: string,
  mimeType = "text/plain",
  parentId: string | null = null,
): Promise<string> {
  await getAuth();
  const metadata: drive_v3.Schema$File = {
    name,
    ...(parentId && { parents: [parentId] }),
  };
  const media = { mimeType, body: content };
  const res = await drive.files.create({
    requestBody: metadata,
    media,
    fields: "id",
  });
  if (!res.data.id) {
    throw new Error("File creation failed, no ID returned.");
  }
  return res.data.id;
}
