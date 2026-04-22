/**
 * PDF preprocessing. Vision models need rasterized pages, so we convert every
 * PDF to one PNG per page on ingest.
 *
 * Uses `pdf-to-png-converter` (pure JS, no native graphicsmagick dep). If it
 * ever becomes a bottleneck, swap for `pdf2pic` + imagemagick.
 */
import { pdfToPng } from 'pdf-to-png-converter';
import path from 'node:path';
import type { StorageProvider } from './storage.js';

export interface RasterizedPage {
  pageIndex: number;
  storageKey: string;
  widthPx: number;
  heightPx: number;
}

export async function convertPdfToImages(
  storage: StorageProvider,
  sourceKey: string,
  sourceFilename: string,
): Promise<RasterizedPage[]> {
  const sourcePath = storage.absolutePath(sourceKey);

  const pages = await pdfToPng(sourcePath, {
    // 2x upscale. Better OCR/vision accuracy, ~4x file size.
    viewportScale: 2.0,
    outputFolder: undefined, // return buffers only
  });

  const baseName = path.parse(sourceFilename).name;
  const results: RasterizedPage[] = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const key = await storage.save(page.content, `${baseName}_p${i + 1}.png`, 'pages');
    results.push({
      pageIndex: i,
      storageKey: key,
      widthPx: page.width,
      heightPx: page.height,
    });
  }
  return results;
}
