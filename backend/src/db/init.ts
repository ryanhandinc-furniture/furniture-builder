/**
 * Standalone DB bootstrapper (`npm run db:init`). Importing db/index.ts has the
 * same side-effect, but having a dedicated script makes the intent obvious
 * for CI / deploy pipelines.
 */
import 'dotenv/config';
import { db } from './index.js';

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all();

console.log('Initialized database. Tables:');
for (const t of tables as Array<{ name: string }>) {
  console.log(`  - ${t.name}`);
}
