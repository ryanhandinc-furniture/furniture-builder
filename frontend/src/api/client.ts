/**
 * Typed HTTP client. One thin wrapper so component code never deals with
 * fetch/URL/headers.
 */
import type {
  FurnitureCatalogItem,
  FurniturePlacement,
  Plan,
  Unit,
  UnitType,
} from '../types';

/**
 * In dev: `VITE_API_URL` is undefined, so we use relative paths and Vite's
 * proxy forwards /api/* to the backend on localhost:4000.
 * In production (Vercel + Render): set VITE_API_URL to the Render URL so
 * fetch hits the backend directly.
 */
const API_BASE: string = import.meta.env.VITE_API_URL ?? '';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  uploadPlan(file: File): Promise<{ plan: Plan }> {
    const fd = new FormData();
    fd.append('file', file);
    return req('/api/plans/upload', { method: 'POST', body: fd });
  },

  listPlans(): Promise<{ plans: Plan[] }> {
    return req('/api/plans');
  },

  getPlan(id: string): Promise<{ plan: Plan; units: Unit[] }> {
    return req(`/api/plans/${id}`);
  },

  manualUnits(
    planId: string,
    units: Array<{
      unitNumber: string;
      floor: number;
      unitType: UnitType;
      squareFootage: number;
    }>,
  ): Promise<{ units: Unit[] }> {
    return req(`/api/plans/${planId}/units`, {
      method: 'POST',
      body: JSON.stringify({ units }),
    });
  },

  getUnit(id: string): Promise<{ unit: Unit; placements: FurniturePlacement[] }> {
    return req(`/api/units/${id}`);
  },

  savePlacement(
    unitId: string,
    placement: Omit<FurniturePlacement, 'unitId' | 'updatedAt'>,
  ): Promise<{ placement: FurniturePlacement }> {
    return req(`/api/units/${unitId}/furniture`, {
      method: 'POST',
      body: JSON.stringify(placement),
    });
  },

  updatePlacement(
    unitId: string,
    placeId: string,
    patch: Partial<FurniturePlacement>,
  ): Promise<{ placement: FurniturePlacement }> {
    return req(`/api/units/${unitId}/furniture/${placeId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  deletePlacement(unitId: string, placeId: string): Promise<void> {
    return req(`/api/units/${unitId}/furniture/${placeId}`, { method: 'DELETE' });
  },

  catalog(): Promise<{ items: FurnitureCatalogItem[] }> {
    return req('/api/catalog');
  },

  storageUrl(key: string | null | undefined): string | null {
    if (!key) return null;
    return `${API_BASE}/api/storage/${encodeURI(key)}`;
  },
};
