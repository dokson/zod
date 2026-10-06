import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const srcDir: string = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Forward slashes, so the path can go in an import specifier on Windows. */
export function srcPath(relative: string): string {
  return path.resolve(srcDir, relative).split(path.sep).join("/");
}
