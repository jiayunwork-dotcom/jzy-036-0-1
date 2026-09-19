import { randomUUID } from 'node:crypto';
import type {
  DocumentSummary,
  SchemaDocument,
  SchemaVersion,
  VersionSummary,
} from '../../../shared/types.js';
import { JsonFileStorage } from './fileDb.js';

/**
 * Document + version repository.
 *
 * Every content save appends an immutable version entry inside the same
 * atomic write as the document update, so the version trail can never
 * drift from the document's current content. Rollback copies an old
 * version forward as a *new* version — history is never rewritten.
 */

function toSummary(d: { id: string; name: string; createdAt: string; updatedAt: string }): DocumentSummary {
  return { id: d.id, name: d.name, createdAt: d.createdAt, updatedAt: d.updatedAt };
}

function versionSummary(v: { versionNo: number; content: string; createdAt: string }): VersionSummary {
  const firstLine = v.content.split('\n').find((l) => l.trim().length > 0) ?? '';
  return {
    versionNo: v.versionNo,
    createdAt: v.createdAt,
    preview: firstLine.trim().slice(0, 80),
  };
}

export class DocumentStore {
  private readonly storage: JsonFileStorage;

  constructor(filePath?: string) {
    this.storage = new JsonFileStorage(filePath);
  }

  list(): DocumentSummary[] {
    return this.storage
      .documents()
      .map(toSummary)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): SchemaDocument | null {
    const doc = this.storage.documents().find((d) => d.id === id);
    return doc ? { ...toSummary(doc), content: doc.content } : null;
  }

  create(name: string, content: string): SchemaDocument {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.storage.transact((state) => {
      state.documents.push({ id, name, content, createdAt: now, updatedAt: now });
      state.versions.push({ documentId: id, versionNo: 1, content, createdAt: now });
    });
    return this.get(id)!;
  }

  /**
   * Update name and/or content. A content change appends a new version;
   * a name-only change does not.
   */
  update(id: string, patch: { name?: string; content?: string }): SchemaDocument | null {
    const existing = this.get(id);
    if (!existing) return null;

    const name = patch.name ?? existing.name;
    const content = patch.content ?? existing.content;
    const now = new Date().toISOString();

    this.storage.transact((state) => {
      const doc = state.documents.find((d) => d.id === id)!;
      doc.name = name;
      doc.content = content;
      doc.updatedAt = now;
      if (content !== existing.content) {
        state.versions.push({
          documentId: id,
          versionNo: this.nextVersionNo(id),
          content,
          createdAt: now,
        });
      }
    });
    return this.get(id);
  }

  remove(id: string): boolean {
    const exists = this.storage.documents().some((d) => d.id === id);
    if (!exists) return false;
    this.storage.transact((state) => {
      state.documents = state.documents.filter((d) => d.id !== id);
      state.versions = state.versions.filter((v) => v.documentId !== id);
    });
    return true;
  }

  listVersions(documentId: string): VersionSummary[] {
    return this.storage
      .versions()
      .filter((v) => v.documentId === documentId)
      .map(versionSummary)
      .sort((a, b) => b.versionNo - a.versionNo);
  }

  getVersion(documentId: string, versionNo: number): SchemaVersion | null {
    const v = this.storage
      .versions()
      .find((x) => x.documentId === documentId && x.versionNo === versionNo);
    if (!v) return null;
    return { ...versionSummary(v), documentId, content: v.content };
  }

  /** Restore an old version as the document's current content (recorded as a new version). */
  rollback(documentId: string, versionNo: number): SchemaDocument | null {
    const version = this.getVersion(documentId, versionNo);
    if (!version) return null;
    return this.update(documentId, { content: version.content });
  }

  private nextVersionNo(documentId: string): number {
    const nos = this.storage
      .versions()
      .filter((v) => v.documentId === documentId)
      .map((v) => v.versionNo);
    return nos.length === 0 ? 1 : Math.max(...nos) + 1;
  }
}
