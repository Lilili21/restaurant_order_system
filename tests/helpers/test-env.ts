import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ORIGINAL_CWD = process.cwd();

export function createWorkspace(name: string) {
  const dir = mkdtempSync(path.join(tmpdir(), `menu-tests-${name}-`));
  mkdirSync(path.join(dir, "data"), { recursive: true });
  return dir;
}

export function useWorkspace(dir: string) {
  process.chdir(dir);
}

export function restoreWorkspace() {
  process.chdir(ORIGINAL_CWD);
}

export function writeJson(dir: string, relativePath: string, value: unknown) {
  const targetPath = path.join(dir, relativePath);
  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, JSON.stringify(value, null, 2), "utf8");
}
