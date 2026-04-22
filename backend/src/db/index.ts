import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { SCHEMA_SQL } from './schema.js';

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.resolve(process.cwd(), '../data/app.db');

// Ensure parent directory exists — SQLite won't create it for us.
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Bootstrap schema on first boot. Idempotent — CREATE TABLE IF NOT EXISTS.
db.exec(SCHEMA_SQL);

export function withTx<T>(fn: () => T): T {
  const tx = db.transaction(fn);
  return tx();
}
