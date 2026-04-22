/**
 * Serves stored blobs (uploaded plans, page rasters, unit crops).
 *
 * Route shape: GET /api/storage/*path  → the entire path after /api/storage/
 * is the storage key. The key MUST pass through storage.absolutePath() which
 * refuses traversal attempts.
 */
import { Router } from 'express';
import fs from 'node:fs';
import type { StorageProvider } from '../services/storage.js';

export function storageRouter(storage: StorageProvider): Router {
  const router = Router();

  router.get('/:key(*)', (req, res) => {
    const key = decodeURIComponent(req.params.key ?? '');
    if (!key) return res.status(400).json({ error: 'Missing key' });
    let abs: string;
    try {
      abs = storage.absolutePath(key);
    } catch {
      return res.status(400).json({ error: 'Invalid key' });
    }
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'Not found' });
    res.sendFile(abs);
  });

  return router;
}
