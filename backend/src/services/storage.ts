/**
 * Pluggable storage provider.
 *
 * Interface-first: anything that can save/read/key-address blobs implements
 * `StorageProvider`. The MVP ships with `LocalStorage`; an S3 adapter can be
 * dropped in without touching the routes or services that depend on it.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

export interface StorageProvider {
  /** Persist a blob and return its storage key (opaque identifier). */
  save(buffer: Buffer, filename: string, subdir?: string): Promise<string>;
  /** Read a blob by key. */
  read(key: string): Promise<Buffer>;
  /** Absolute filesystem path for a key (only meaningful for LocalStorage). */
  absolutePath(key: string): string;
  /** Remove a blob. No-op if missing. */
  remove(key: string): Promise<void>;
}

export class LocalStorage implements StorageProvider {
  constructor(private readonly root: string) {}

  async save(buffer: Buffer, filename: string, subdir = 'uploads'): Promise<string> {
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const dir = path.join(this.root, subdir);
    await fs.mkdir(dir, { recursive: true });
    const key = path.posix.join(subdir, `${Date.now()}_${safe}`);
    await fs.writeFile(path.join(this.root, key), buffer);
    return key;
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFile(this.absolutePath(key));
  }

  absolutePath(key: string): string {
    // Defense in depth: refuse keys that try to escape the storage root.
    // Compare with a trailing separator so `/tmp/store-evil/...` cannot
    // match `/tmp/store` as a prefix.
    const resolved = path.resolve(this.root, key);
    const rootWithSep = path.resolve(this.root) + path.sep;
    if (resolved !== path.resolve(this.root) && !resolved.startsWith(rootWithSep)) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return resolved;
  }

  async remove(key: string): Promise<void> {
    try {
      await fs.unlink(this.absolutePath(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}

export function createStorage(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER ?? 'local';
  if (provider === 'local') {
    const root = path.resolve(process.cwd(), process.env.STORAGE_DIR ?? '../storage');
    return new LocalStorage(root);
  }
  // Future: S3StorageProvider, GCSStorageProvider, etc.
  throw new Error(`Unsupported STORAGE_PROVIDER: ${provider}`);
}
