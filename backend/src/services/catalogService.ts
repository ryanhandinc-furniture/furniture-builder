/**
 * Furniture catalog. The default catalog ships as JSON; an external catalog
 * can be merged in by setting `EXTERNAL_CATALOG_URL`, which must serve JSON
 * conforming to the FurnitureCatalogItem schema (see types/index.ts).
 *
 * The composition strategy is "external wins on id collision" so a
 * vendor-supplied Twin XL Bed overrides our generic one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FurnitureCatalogItem } from '../types/index.js';

export interface CatalogProvider {
  list(): Promise<FurnitureCatalogItem[]>;
  byId(id: string): Promise<FurnitureCatalogItem | null>;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDefault(): FurnitureCatalogItem[] {
  const jsonPath = path.resolve(__dirname, '../data/default-catalog.json');
  const raw = fs.readFileSync(jsonPath, 'utf-8');
  const parsed = JSON.parse(raw) as { items: FurnitureCatalogItem[] };
  return parsed.items.map((i) => ({ ...i, source: 'default' }));
}

async function loadExternal(url: string): Promise<FurnitureCatalogItem[]> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`External catalog fetch failed (${res.status}): ${url}`);
  }
  const parsed = (await res.json()) as { items?: FurnitureCatalogItem[] };
  if (!Array.isArray(parsed?.items)) {
    throw new Error('External catalog payload missing "items" array');
  }
  return parsed.items.map((i) => ({ ...i, source: 'external' }));
}

export class CompositeCatalog implements CatalogProvider {
  private cache: FurnitureCatalogItem[] | null = null;
  private cacheAt = 0;
  private readonly ttlMs = 60_000;

  constructor(private readonly externalUrl?: string) {}

  async list(): Promise<FurnitureCatalogItem[]> {
    const fresh = this.cache && Date.now() - this.cacheAt < this.ttlMs;
    if (fresh && this.cache) return this.cache;

    const defaults = loadDefault();
    let external: FurnitureCatalogItem[] = [];
    if (this.externalUrl) {
      try {
        external = await loadExternal(this.externalUrl);
      } catch (err) {
        // External catalogs should never take the app down. Log + fall back.
        console.warn(`[catalog] external load failed:`, (err as Error).message);
      }
    }

    // Merge: external wins on id collision.
    const map = new Map<string, FurnitureCatalogItem>();
    for (const item of defaults) map.set(item.id, item);
    for (const item of external) map.set(item.id, item);
    this.cache = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    this.cacheAt = Date.now();
    return this.cache;
  }

  async byId(id: string): Promise<FurnitureCatalogItem | null> {
    const all = await this.list();
    return all.find((i) => i.id === id) ?? null;
  }
}

export function createCatalog(): CatalogProvider {
  return new CompositeCatalog(process.env.EXTERNAL_CATALOG_URL);
}
