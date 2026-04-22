import { Router } from 'express';
import { nanoid } from 'nanoid';
import { unitsRepo, placementsRepo } from '../db/repositories.js';
import type { FurniturePlacement } from '../types/index.js';

export function unitsRouter(): Router {
  const router = Router();

  // GET /api/units/:id  — unit + placements
  router.get('/:id', (req, res) => {
    const unit = unitsRepo.get(req.params.id);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });
    const placements = placementsRepo.listByUnit(unit.id);
    res.json({ unit, placements });
  });

  // GET /api/units/:id/furniture
  router.get('/:id/furniture', (req, res) => {
    const unit = unitsRepo.get(req.params.id);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });
    res.json({ placements: placementsRepo.listByUnit(unit.id) });
  });

  /**
   * POST /api/units/:id/furniture
   * Body: FurniturePlacement (id optional — generated if missing)
   */
  router.post('/:id/furniture', (req, res) => {
    const unit = unitsRepo.get(req.params.id);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    const body = req.body as Partial<FurniturePlacement>;
    const required: (keyof FurniturePlacement)[] = [
      'catalogItemId',
      'xInches',
      'yInches',
      'widthInches',
      'depthInches',
    ];
    for (const f of required) {
      if (body[f] === undefined) {
        return res.status(400).json({ error: `Missing field: ${f}` });
      }
    }

    const placement: FurniturePlacement = {
      id: body.id ?? nanoid(),
      unitId: unit.id,
      catalogItemId: body.catalogItemId!,
      xInches: body.xInches!,
      yInches: body.yInches!,
      widthInches: body.widthInches!,
      depthInches: body.depthInches!,
      rotationDegrees: body.rotationDegrees ?? 0,
      updatedAt: new Date().toISOString(),
    };
    placementsRepo.upsert(placement);
    res.status(201).json({ placement });
  });

  /**
   * PATCH /api/units/:id/furniture/:placeId
   */
  router.patch('/:id/furniture/:placeId', (req, res) => {
    const existing = placementsRepo.get(req.params.placeId);
    if (!existing || existing.unitId !== req.params.id) {
      return res.status(404).json({ error: 'Placement not found' });
    }
    const body = req.body as Partial<FurniturePlacement>;
    const merged: FurniturePlacement = {
      ...existing,
      ...body,
      id: existing.id,
      unitId: existing.unitId,
      updatedAt: new Date().toISOString(),
    };
    placementsRepo.upsert(merged);
    res.json({ placement: merged });
  });

  /**
   * DELETE /api/units/:id/furniture/:placeId
   */
  router.delete('/:id/furniture/:placeId', (req, res) => {
    const existing = placementsRepo.get(req.params.placeId);
    if (!existing || existing.unitId !== req.params.id) {
      return res.status(404).json({ error: 'Placement not found' });
    }
    placementsRepo.remove(existing.id);
    res.status(204).send();
  });

  return router;
}
