import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Durable JSON-file storage engine.
 *
 * The whole store state lives in one JSON document on disk. Every mutation
 * is written through atomically (write temp file + rename), so a crash
 * mid-write can never leave a torn file. Writes are synchronous, which
 * serializes concurrent requests within the process — two documents being
 * edited at the same time can never interleave or cross-write.
 *
 * Pass ':memory:' as the path for a non-persistent store (tests).
 */

export interface StoredDocument {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredVersion {
  documentId: string;
  versionNo: number;
  content: string;
  createdAt: string;
}

interface StoreState {
  documents: StoredDocument[];
  versions: StoredVersion[];
}

export class JsonFileStorage {
  private readonly file: string | null;
  private state: StoreState;

  constructor(filePath?: string) {
    const file = filePath ?? process.env.DB_PATH ?? resolve('data', 'store.json');
    if (file === ':memory:') {
      this.file = null;
      this.state = { documents: [], versions: [] };
      return;
    }
    this.file = file;
    mkdirSync(dirname(file), { recursive: true });
    this.state = this.load();
  }

  private load(): StoreState {
    if (this.file && existsSync(this.file)) {
      try {
        const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as StoreState;
        return {
          documents: parsed.documents ?? [],
          versions: parsed.versions ?? [],
        };
      } catch {
        // A corrupt store must not crash the server: start clean.
        return { documents: [], versions: [] };
      }
    }
    return { documents: [], versions: [] };
  }

  /** Read-view of all documents. */
  documents(): StoredDocument[] {
    return this.state.documents;
  }

  /** Read-view of all versions. */
  versions(): StoredVersion[] {
    return this.state.versions;
  }

  /** Apply a mutation and flush the resulting state to disk atomically. */
  transact(mutate: (state: StoreState) => void): void {
    mutate(this.state);
    this.flush();
  }

  private flush(): void {
    if (!this.file) return;
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf8');
    renameSync(tmp, this.file);
  }
}
