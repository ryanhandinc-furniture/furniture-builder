/**
 * Canonical types shared across services, routes, and DB layer.
 *
 * Mirrored in frontend/src/types/index.ts — keep them in sync.
 */

export type UnitType = 'studio' | '1BR' | '2BR' | '3BR' | '4BR' | 'other';

export type PlanStatus = 'pending' | 'processing' | 'complete' | 'failed';

export interface Plan {
  id: string;
  filename: string;
  mimeType: string;
  storageKey: string; // source file as stored
  uploadedAt: string; // ISO timestamp
  status: PlanStatus;
  pageCount: number;
  errorMessage: string | null;
}

export interface Unit {
  id: string;
  planId: string;
  unitNumber: string;
  floor: number;
  unitType: UnitType;
  squareFootage: number;
  floorPlanImageKey: string | null; // storage key for isolated floor-plan crop
  /**
   * Bounding box on the source plan page, normalized 0-1, so that the same
   * crop can be regenerated even if the underlying image is re-rasterized at
   * a different resolution.
   */
  bboxNormalized: { x: number; y: number; width: number; height: number } | null;
  sourcePageIndex: number;
}

export type FurnitureCategory =
  | 'bedroom'
  | 'living'
  | 'dining'
  | 'office'
  | 'storage'
  | 'bathroom'
  | 'other';

export type FurnitureIconShape = 'rect' | 'round';

/**
 * Schema for a single catalog item. All physical dimensions are in INCHES so
 * that placements are unit-agnostic and can be scaled onto any floor plan
 * whose pixel-to-inch ratio we know (or estimate).
 *
 * External catalog providers must conform to this shape.
 */
export interface FurnitureCatalogItem {
  id: string;
  name: string;
  category: FurnitureCategory;
  widthInches: number;
  depthInches: number;
  heightInches: number;
  color: string; // hex, for the on-canvas placeholder rendering
  iconShape: FurnitureIconShape;
  source: 'default' | 'external';
}

export interface FurniturePlacement {
  id: string;
  unitId: string;
  catalogItemId: string;
  /**
   * Position + size are stored in INCHES relative to the unit's floor-plan
   * origin (top-left). The frontend multiplies by the unit's pixels-per-inch
   * before rendering — see FurnitureCanvas.tsx.
   */
  xInches: number;
  yInches: number;
  widthInches: number;
  depthInches: number;
  rotationDegrees: number;
  updatedAt: string;
}

/**
 * Extraction result produced by any PlanAnalyzer implementation.
 */
export interface ExtractedUnit {
  unitNumber: string;
  floor: number;
  unitType: UnitType;
  squareFootage: number;
  sourcePageIndex: number;
  bboxNormalized?: { x: number; y: number; width: number; height: number };
}

export interface PlanAnalysisResult {
  units: ExtractedUnit[];
  /**
   * Pixels-per-inch estimate of the source plan if a scale bar was detected.
   * Used to size furniture correctly on the canvas.
   */
  pixelsPerInch?: number;
  rawResponse?: string;
}
