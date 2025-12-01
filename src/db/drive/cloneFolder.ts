import { existsSync, mkdirSync, createWriteStream } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { getAuth } from './auth';
import { drive } from './client';

async function downloadFile(fileId: string, destPath: string) {
    await getAuth();
    const dest = createWriteStream(destPath);
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
    await pipeline(res.data, dest);
}

async function listFiles(folderId: string) {
    await getAuth();
    const query = `'${folderId}' in parents and trashed=false`;
    const res = await drive.files.list({
        q: query,
        fields: 'files(id, name, mimeType)',
    });
    return res.data.files || [];
}

async function cloneFolderRecursive(folderId: string, destPath: string) {
    if (!existsSync(destPath)) {
        mkdirSync(destPath, { recursive: true });
    }

    const files = await listFiles(folderId);

    for (const file of files) {
        const filePath = join(destPath, file.name || 'untitled');

        if (file.mimeType === 'application/vnd.google-apps.folder') {
            console.log(`Creating folder: ${filePath}`);
            await cloneFolderRecursive(file.id || '', filePath);
        } else {
            console.log(`Downloading file: ${filePath}`);
            await downloadFile(file.id || '', filePath);
        }
    }
}

export async function cloneFolder(folderId: string, localPath: string) {
    await getAuth();
    const folder = await drive.files.get({ fileId: folderId, fields: 'name' });
    const folderName = folder.data.name || 'folder';
    const destPath = join(localPath);

    console.log(`Cloning folder "${folderName}" to ${destPath}`);
    await cloneFolderRecursive(folderId, destPath);
    console.log('Clone complete!');
}