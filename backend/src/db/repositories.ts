/**
 * Thin data-access layer. Every route goes through these functions instead of
 * hitting db.prepare() directly — keeps SQL in one place for the Postgres
 * migration.
 */
import { db } from './index.js';
import type {
  Plan,
  PlanStatus,
  Unit,
  UnitType,
  FurniturePlacement,
} from '../types/index.js';

// ---- Row types (snake_case out of SQLite) -------------------------------

interface PlanRow {
  id: string;
  filename: string;
  mime_type: string;
  storage_key: string;
  uploaded_at: string;
  status: PlanStatus;
  page_count: number;
  error_message: string | null;
}

interface UnitRow {
  id: string;
  plan_id: string;
  unit_number: string;
  floor: number;
  unit_type: UnitType;
  square_footage: number;
  floor_plan_image_key: string | null;
  bbox_json: string | null;
  source_page_index: number;
}

interface PlacementRow {
  id: string;
  unit_id: string;
  catalog_item_id: string;
  x_inches: number;
  y_inches: number;
  width_inches: number;
  depth_inches: number;
  rotation_degrees: number;
  updated_at: string;
}

function rowToPlan(r: PlanRow): Plan {
  return {
    id: r.id,
    filename: r.filename,
    mimeType: r.mime_type,
    storageKey: r.storage_key,
    uploadedAt: r.uploaded_at,
    status: r.status,
    pageCount: r.page_count,
    errorMessage: r.error_message,
  };
}

function rowToUnit(r: UnitRow): Unit {
  return {
    id: r.id,
    planId: r.plan_id,
    unitNumber: r.unit_number,
    floor: r.floor,
    unitType: r.unit_type,
    squareFootage: r.square_footage,
    floorPlanImageKey: r.floor_plan_image_key,
    bboxNormalized: r.bbox_json ? JSON.parse(r.bbox_json) : null,
    sourcePageIndex: r.source_page_index,
  };
}

function rowToPlacement(r: PlacementRow): FurniturePlacement {
  return {
    id: r.id,
    unitId: r.unit_id,
    catalogItemId: r.catalog_item_id,
    xInches: r.x_inches,
    yInches: r.y_inches,
    widthInches: r.width_inches,
    depthInches: r.depth_inches,
    rotationDegrees: r.rotation_degrees,
    updatedAt: r.updated_at,
  };
}

// ---- Plans --------------------------------------------------------------

export const plansRepo = {
  insert(plan: Plan): void {
    db.prepare(
      `INSERT INTO plans (id, filename, mime_type, storage_key, uploaded_at,
         status, page_count, error_message)
       VALUES (@id, @filename, @mimeType, @storageKey, @uploadedAt,
         @status, @pageCount, @errorMessage)`,
    ).run(plan);
  },

  updateStatus(id: string, status: PlanStatus, errorMessage: string | null = null): void {
    db.prepare(
      `UPDATE plans SET status = ?, error_message = ? WHERE id = ?`,
    ).run(status, errorMessage, id);
  },

  updatePageCount(id: string, pageCount: number): void {
    db.prepare(`UPDATE plans SET page_count = ? WHERE id = ?`).run(pageCount, id);
  },

  list(): Plan[] {
    const rows = db
      .prepare<[], PlanRow>(`SELECT * FROM plans ORDER BY uploaded_at DESC`)
      .all();
    return rows.map(rowToPlan);
  },

  get(id: string): Plan | null {
    const row = db
      .prepare<[string], PlanRow>(`SELECT * FROM plans WHERE id = ?`)
      .get(id);
    return row ? rowToPlan(row) : null;
  },
};

// ---- Units --------------------------------------------------------------

export const unitsRepo = {
  insertMany(units: Unit[]): void {
    const stmt = db.prepare(
      `INSERT INTO units (id, plan_id, unit_number, floor, unit_type,
         square_footage, floor_plan_image_key, bbox_json, source_page_index)
       VALUES (@id, @planId, @unitNumber, @floor, @unitType,
         @squareFootage, @floorPlanImageKey, @bboxJson, @sourcePageIndex)`,
    );
    const tx = db.transaction((rows: Unit[]) => {
      for (const u of rows) {
        stmt.run({
          ...u,
          bboxJson: u.bboxNormalized ? JSON.stringify(u.bboxNormalized) : null,
        });
      }
    });
    tx(units);
  },

  listByPlan(planId: string): Unit[] {
    const rows = db
      .prepare<[string], UnitRow>(
        `SELECT * FROM units WHERE plan_id = ? ORDER BY floor ASC, unit_number ASC`,
      )
      .all(planId);
    return rows.map(rowToUnit);
  },

  get(id: string): Unit | null {
    const row = db
      .prepare<[string], UnitRow>(`SELECT * FROM units WHERE id = ?`)
      .get(id);
    return row ? rowToUnit(row) : null;
  },

  updateImageKey(id: string, key: string): void {
    db.prepare(`UPDATE units SET floor_plan_image_key = ? WHERE id = ?`).run(key, id);
  },
};

// ---- Furniture placements ----------------------------------------------

export const placementsRepo = {
  upsert(placement: FurniturePlacement): void {
    db.prepare(
      `INSERT INTO furniture_placements
         (id, unit_id, catalog_item_id, x_inches, y_inches,
          width_inches, depth_inches, rotation_degrees, updated_at)
       VALUES (@id, @unitId, @catalogItemId, @xInches, @yInches,
          @widthInches, @depthInches, @rotationDegrees, @updatedAt)
       ON CONFLICT(id) DO UPDATE SET
         catalog_item_id  = excluded.catalog_item_id,
         x_inches         = excluded.x_inches,
         y_inches         = excluded.y_inches,
         width_inches     = excluded.width_inches,
         depth_inches     = excluded.depth_inches,
         rotation_degrees = excluded.rotation_degrees,
         updated_at       = excluded.updated_at`,
    ).run(placement);
  },

  listByUnit(unitId: string): FurniturePlacement[] {
    const rows = db
      .prepare<[string], PlacementRow>(
        `SELECT * FROM furniture_placements WHERE unit_id = ? ORDER BY updated_at ASC`,
      )
      .all(unitId);
    return rows.map(rowToPlacement);
  },

  remove(id: string): void {
    db.prepare(`DELETE FROM furniture_placements WHERE id = ?`).run(id);
  },

  get(id: string): FurniturePlacement | null {
    const row = db
      .prepare<[string], PlacementRow>(
        `SELECT * FROM furniture_placements WHERE id = ?`,
      )
      .get(id);
    return row ? rowToPlacement(row) : null;
  },
};
