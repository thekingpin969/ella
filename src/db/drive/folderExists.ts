import { drive } from "./client";
import { getAuth } from "./auth";
import { drive_v3 } from "googleapis";

export async function folderExists(
  name: string,
  parentId: string | null = null,
): Promise<string | null> {
  await getAuth();
  const query = parentId
    ? `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const res = await drive.files.list({ q: query, fields: "files(id, name)" });
  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id || null;
  }
  return null;
}
