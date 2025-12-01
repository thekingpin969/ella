import { drive } from "./client";
import { getAuth } from "./auth";
import { drive_v3 } from "googleapis";

export async function createFolder(
  name: string,
  parentId: string | null = null,
): Promise<string> {
  await getAuth();
  const metadata: drive_v3.Schema$File = {
    name,
    mimeType: "application/vnd.google-apps.folder",
    ...(parentId && { parents: [parentId] }),
  };
  const res = await drive.files.create({ requestBody: metadata, fields: "id" });
  if (!res.data.id) {
    throw new Error("Folder creation failed, no ID returned.");
  }
  return res.data.id;
}
