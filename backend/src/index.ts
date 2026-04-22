import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createStorage } from './services/storage.js';
import { createAnalyzer } from './services/aiService.js';
import { createCatalog } from './services/catalogService.js';
import { plansRouter } from './routes/plans.js';
import { unitsRouter } from './routes/units.js';
import { catalogRouter } from './routes/catalog.js';
import { storageRouter } from './routes/storage.js';
import './db/index.js'; // side-effect: ensure schema

const PORT = Number(process.env.PORT ?? 4000);

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Dependency wiring. Each factory reads env + returns an interface-typed
// instance; routes receive these as constructor args and stay ignorant of
// the concrete implementation.
const storage = createStorage();
const analyzer = createAnalyzer();
const catalog = createCatalog();

console.log(
  `[boot] storage=${process.env.STORAGE_PROVIDER ?? 'local'}  ai=${analyzer.name}  db=${process.env.DB_PATH ?? '../data/app.db'}`,
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ai: analyzer.name });
});

app.use('/api/plans', plansRouter(storage, analyzer));
app.use('/api/units', unitsRouter());
app.use('/api/catalog', catalogRouter(catalog));
app.use('/api/storage', storageRouter(storage));

// Central error handler — ensures JSON shape even for unexpected throws.
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error('[error]', err);
    res.status(500).json({ error: err.message });
  },
);

app.listen(PORT, () => {
  console.log(`[boot] listening on http://localhost:${PORT}`);
});
