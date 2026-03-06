import { readFile } from "node:fs/promises";

export async function readArtifactUtf8(absolutePath: string): Promise<string> {
  return await readFile(absolutePath, "utf8");
}

export async function readArtifactBytes(absolutePath: string): Promise<Uint8Array> {
  return await readFile(absolutePath);
}
