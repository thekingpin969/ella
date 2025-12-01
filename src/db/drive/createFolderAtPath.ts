import { folderExists } from "./folderExists";
import { createFolder } from "./createFolder";

export async function createFolderAtPath(path: string): Promise<string | null> {
  const parts = path.split("/").filter((p) => p);
  let parentId: string | null = null;

  for (const part of parts) {
    let folderId = await folderExists(part, parentId);
    if (!folderId) {
      folderId = await createFolder(part, parentId);
    }
    parentId = folderId;
  }

  return parentId;
}
