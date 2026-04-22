import { Router } from 'express';
import type { CatalogProvider } from '../services/catalogService.js';

export function catalogRouter(catalog: CatalogProvider): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const items = await catalog.list();
    res.json({ items });
  });

  return router;
}
