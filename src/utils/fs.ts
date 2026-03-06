import { lstat, mkdir, readFile, readdir, readlink, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureParentDir(targetPath: string): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true });
}

export async function readUtf8(targetPath: string): Promise<string> {
  return await readFile(targetPath, "utf8");
}

export async function readBytes(targetPath: string): Promise<Uint8Array> {
  return await readFile(targetPath);
}

export async function writeUtf8(targetPath: string, content: string): Promise<void> {
  await ensureParentDir(targetPath);
  if (await isSymlinkPath(targetPath)) {
    await rm(targetPath, { force: true });
  }
  await writeFile(targetPath, content, "utf8");
}

export async function writeBytes(targetPath: string, content: Uint8Array): Promise<void> {
  await ensureParentDir(targetPath);
  if (await isSymlinkPath(targetPath)) {
    await rm(targetPath, { force: true });
  }
  await writeFile(targetPath, content);
}

export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

export async function isSymlinkPath(targetPath: string): Promise<boolean> {
  try {
    return (await lstat(targetPath)).isSymbolicLink();
  } catch {
    return false;
  }
}

export async function isSymlinkTo(linkPath: string, targetPath: string): Promise<boolean> {
  try {
    const stats = await lstat(linkPath);
    if (!stats.isSymbolicLink()) {
      return false;
    }

    const linkTarget = await readlink(linkPath);
    return path.resolve(path.dirname(linkPath), linkTarget) === path.resolve(targetPath);
  } catch {
    return false;
  }
}

export async function removePath(targetPath: string): Promise<void> {
  await rm(targetPath, { recursive: true, force: true });
}

export async function listFilesRecursive(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listFilesRecursive(entryPath)));
    } else {
      results.push(entryPath);
    }
  }

  return results;
}
