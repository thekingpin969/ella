import { folderExists } from "./folderExists";

export async function getFolderByPath(path: string): Promise<string | null> {
  const parts = path.split("/").filter((p) => p);
  let parentId: string | null = null;

  for (const part of parts) {
    const folderId = await folderExists(part, parentId);
    if (!folderId) return null;
    parentId = folderId;
  }

  return parentId;
}
