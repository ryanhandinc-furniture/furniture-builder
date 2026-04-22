/**
 * Mirrors backend/src/types/index.ts. Keep in sync — the backend is the
 * source of truth.
 */

export type UnitType = 'studio' | '1BR' | '2BR' | '3BR' | '4BR' | 'other';
export type PlanStatus = 'pending' | 'processing' | 'complete' | 'failed';

export interface Plan {
  id: string;
  filename: string;
  mimeType: string;
  storageKey: string;
  uploadedAt: string;
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
  floorPlanImageKey: string | null;
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

export interface FurnitureCatalogItem {
  id: string;
  name: string;
  category: FurnitureCategory;
  widthInches: number;
  depthInches: number;
  heightInches: number;
  color: string;
  iconShape: FurnitureIconShape;
  source: 'default' | 'external';
}

export interface FurniturePlacement {
  id: string;
  unitId: string;
  catalogItemId: string;
  xInches: number;
  yInches: number;
  widthInches: number;
  depthInches: number;
  rotationDegrees: number;
  updatedAt: string;
}
