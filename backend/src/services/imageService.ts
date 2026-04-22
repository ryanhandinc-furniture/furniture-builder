/**
 * Image cropping helper. Given a source page image and a normalized bbox
 * (x,y,w,h in 0..1), produce a cropped PNG and save it via the storage
 * provider. Returns the new storage key.
 *
 * Uses sharp — native, very fast, no disk roundtrips beyond what storage
 * requires.
 */
import sharp from 'sharp';
import path from 'node:path';
import type { StorageProvider } from './storage.js';

export interface BboxNormalized {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function cropUnit(
  storage: StorageProvider,
  pageKey: string,
  bbox: BboxNormalized,
  unitLabel: string,
): Promise<{ key: string; widthPx: number; heightPx: number }> {
  const pagePath = storage.absolutePath(pageKey);

  // Read dimensions to convert normalized bbox → pixel bbox.
  const meta = await sharp(pagePath).metadata();
  if (!meta.width || !meta.height) {
    throw new Error(`cropUnit: could not read dimensions for ${pageKey}`);
  }

  // Clamp + round. Sharp requires integer, positive extents.
  const left = Math.max(0, Math.round(bbox.x * meta.width));
  const top = Math.max(0, Math.round(bbox.y * meta.height));
  const width = Math.max(1, Math.round(bbox.width * meta.width));
  const height = Math.max(1, Math.round(bbox.height * meta.height));

  // Guard against bboxes that extend beyond the image.
  const safeWidth = Math.min(width, meta.width - left);
  const safeHeight = Math.min(height, meta.height - top);

  const buf = await sharp(pagePath)
    .extract({ left, top, width: safeWidth, height: safeHeight })
    .png()
    .toBuffer();

  const safeLabel = unitLabel.replace(/[^a-zA-Z0-9._-]/g, '_');
  const base = path.parse(pageKey).name;
  const key = await storage.save(buf, `${base}__${safeLabel}.png`, 'units');

  return { key, widthPx: safeWidth, heightPx: safeHeight };
}
