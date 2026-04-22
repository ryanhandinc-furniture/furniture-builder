import { Router } from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import type { StorageProvider } from '../services/storage.js';
import type { PlanAnalyzer } from '../services/aiService.js';
import { plansRepo, unitsRepo } from '../db/repositories.js';
import { runPlanPipeline, buildUnitFromManualEntry } from '../services/planPipeline.js';
import type { Plan, UnitType } from '../types/index.js';

// 50 MB hard cap is generous for architectural PDFs; raise if you routinely
// process 100+ page sets.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const ACCEPTED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
]);

export function plansRouter(storage: StorageProvider, analyzer: PlanAnalyzer): Router {
  const router = Router();

  // -----------------------------------------------------------------
  // POST /api/plans/upload
  // -----------------------------------------------------------------
  router.post(
    '/upload',
    upload.single('file'),
    async (req, res) => {
      if (!req.file) return res.status(400).json({ error: 'Missing file field' });
      if (!ACCEPTED_MIME.has(req.file.mimetype)) {
        return res
          .status(400)
          .json({ error: `Unsupported file type: ${req.file.mimetype}` });
      }

      const key = await storage.save(
        req.file.buffer,
        req.file.originalname,
        'plans',
      );

      const plan: Plan = {
        id: nanoid(),
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        storageKey: key,
        uploadedAt: new Date().toISOString(),
        status: 'pending',
        pageCount: 1,
        errorMessage: null,
      };
      plansRepo.insert(plan);

      // Fire and forget — the frontend polls for status.
      runPlanPipeline(plan.id, storage, analyzer).catch((err) => {
        console.error(`[upload] pipeline crash:`, err);
      });

      return res.status(202).json({ plan });
    },
  );

  // -----------------------------------------------------------------
  // GET /api/plans
  // -----------------------------------------------------------------
  router.get('/', (_req, res) => {
    res.json({ plans: plansRepo.list() });
  });

  // -----------------------------------------------------------------
  // GET /api/plans/:id
  // -----------------------------------------------------------------
  router.get('/:id', (req, res) => {
    const plan = plansRepo.get(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    const units = unitsRepo.listByPlan(plan.id);
    res.json({ plan, units });
  });

  // -----------------------------------------------------------------
  // POST /api/plans/:id/units
  //
  // Manual unit matrix entry — used when AI extraction fails or the
  // user wants to override. Body: { units: [{ unitNumber, floor, unitType, squareFootage }] }
  // -----------------------------------------------------------------
  router.post('/:id/units', (req, res) => {
    const plan = plansRepo.get(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const body = req.body as {
      units?: Array<{
        unitNumber: string;
        floor: number;
        unitType: UnitType;
        squareFootage: number;
      }>;
      replace?: boolean;
    };

    if (!Array.isArray(body.units) || body.units.length === 0) {
      return res.status(400).json({ error: 'units[] required and non-empty' });
    }

    const units = body.units.map((u) => buildUnitFromManualEntry(plan.id, u));
    unitsRepo.insertMany(units);
    plansRepo.updateStatus(plan.id, 'complete');
    res.status(201).json({ units });
  });

  return router;
}
