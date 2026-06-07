import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const storageDir = resolve("storage");
const backupDir = resolve(process.env.BACKUP_DIR || "storage/backups");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

await mkdir(backupDir, { recursive: true });

const files = ["app.db", "app.db-wal", "app.db-shm"];
for (const file of files) {
  const source = resolve(storageDir, file);
  if (existsSync(source)) {
    await copyFile(source, resolve(backupDir, `${stamp}-${file}`));
    console.log(`[OK] ${file}`);
  }
}
