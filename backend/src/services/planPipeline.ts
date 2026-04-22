/**
 * End-to-end ingest pipeline:
 *   1. Rasterize PDF → PNG pages (or pass through for already-image uploads)
 *   2. Run each page through the PlanAnalyzer
 *   3. Crop each detected unit from its source page
 *   4. Persist plan + units in a single transaction
 *
 * Runs async-fire-and-forget from the upload route so the HTTP response
 * returns quickly; the frontend polls GET /api/plans/:id for status.
 */
import { nanoid } from 'nanoid';
import type { StorageProvider } from './storage.js';
import type { PlanAnalyzer } from './aiService.js';
import { convertPdfToImages } from './pdfService.js';
import { cropUnit } from './imageService.js';
import { plansRepo, unitsRepo } from '../db/repositories.js';
import type { Plan, Unit, ExtractedUnit } from '../types/index.js';

export async function runPlanPipeline(
  planId: string,
  storage: StorageProvider,
  analyzer: PlanAnalyzer,
): Promise<void> {
  const plan = plansRepo.get(planId);
  if (!plan) throw new Error(`Plan not found: ${planId}`);

  try {
    plansRepo.updateStatus(planId, 'processing');

    const pages = await prepareImagePages(plan, storage);
    plansRepo.updatePageCount(planId, pages.length);

    const allUnits: Unit[] = [];

    for (const page of pages) {
      const result = await analyzer.analyzePlan({
        imagePath: storage.absolutePath(page.storageKey),
        pageIndex: page.pageIndex,
        mimeType: 'image/png',
      });

      for (const extracted of result.units) {
        const unit = await toUnit(planId, page.storageKey, extracted, storage);
        allUnits.push(unit);
      }
    }

    if (allUnits.length === 0) {
      plansRepo.updateStatus(
        planId,
        'failed',
        'AI extraction produced no units. Use manual entry.',
      );
      return;
    }

    unitsRepo.insertMany(allUnits);
    plansRepo.updateStatus(planId, 'complete');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline] plan ${planId} failed:`, msg);
    plansRepo.updateStatus(planId, 'failed', msg);
  }
}

// ------------------------------------------------------------------------

interface PreparedPage {
  pageIndex: number;
  storageKey: string;
}

async function prepareImagePages(
  plan: Plan,
  storage: StorageProvider,
): Promise<PreparedPage[]> {
  if (plan.mimeType === 'application/pdf') {
    const rasterized = await convertPdfToImages(storage, plan.storageKey, plan.filename);
    return rasterized.map((r) => ({ pageIndex: r.pageIndex, storageKey: r.storageKey }));
  }
  if (plan.mimeType.startsWith('image/')) {
    return [{ pageIndex: 0, storageKey: plan.storageKey }];
  }
  // DWG / other — not supported yet for AI extraction. Pipeline will skip.
  throw new Error(
    `Unsupported MIME type for AI extraction: ${plan.mimeType}. Use PDF/PNG/JPG.`,
  );
}

async function toUnit(
  planId: string,
  pageKey: string,
  extracted: ExtractedUnit,
  storage: StorageProvider,
): Promise<Unit> {
  let floorPlanImageKey: string | null = null;
  if (extracted.bboxNormalized) {
    try {
      const crop = await cropUnit(
        storage,
        pageKey,
        extracted.bboxNormalized,
        extracted.unitNumber,
      );
      floorPlanImageKey = crop.key;
    } catch (err) {
      console.warn(
        `[pipeline] crop failed for ${extracted.unitNumber}:`,
        (err as Error).message,
      );
    }
  }

  return {
    id: nanoid(),
    planId,
    unitNumber: extracted.unitNumber,
    floor: extracted.floor,
    unitType: extracted.unitType,
    squareFootage: extracted.squareFootage,
    floorPlanImageKey,
    bboxNormalized: extracted.bboxNormalized ?? null,
    sourcePageIndex: extracted.sourcePageIndex,
  };
}

/**
 * Factory used by both the auto pipeline and the manual-entry route.
 */
export function buildUnitFromManualEntry(
  planId: string,
  input: {
    unitNumber: string;
    floor: number;
    unitType: Unit['unitType'];
    squareFootage: number;
    sourcePageIndex?: number;
  },
): Unit {
  return {
    id: nanoid(),
    planId,
    unitNumber: input.unitNumber,
    floor: input.floor,
    unitType: input.unitType,
    squareFootage: input.squareFootage,
    floorPlanImageKey: null,
    bboxNormalized: null,
    sourcePageIndex: input.sourcePageIndex ?? 0,
  };
}
