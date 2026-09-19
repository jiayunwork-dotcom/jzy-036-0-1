import type {
  ControlNode,
  DocumentSummary,
  FieldNode,
  ParseResult,
  SchemaDocument,
  SchemaVersion,
  ValidationError,
  VersionSummary,
} from '../../../shared/types';

/** Thin typed wrapper over the backend API. */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // keep status message
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  // ---- transform engine ----
  parseText: (text: string) =>
    request<ParseResult>('/api/schema/parse', { method: 'POST', body: JSON.stringify({ text }) }),
  serializeStructure: (structure: FieldNode) =>
    request<{ text: string; controls: ControlNode }>('/api/schema/serialize', {
      method: 'POST',
      body: JSON.stringify({ structure }),
    }),
  validateData: (structure: FieldNode, data: unknown) =>
    request<{ errors: ValidationError[] }>('/api/schema/validate-data', {
      method: 'POST',
      body: JSON.stringify({ structure, data }),
    }),

  // ---- documents & versions ----
  listDocuments: () => request<DocumentSummary[]>('/api/documents'),
  getDocument: (id: string) => request<SchemaDocument>(`/api/documents/${id}`),
  createDocument: (name: string, content?: string) =>
    request<SchemaDocument>('/api/documents', {
      method: 'POST',
      body: JSON.stringify({ name, content }),
    }),
  updateDocument: (id: string, patch: { name?: string; content?: string }) =>
    request<SchemaDocument>(`/api/documents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
  deleteDocument: (id: string) =>
    request<void>(`/api/documents/${id}`, { method: 'DELETE' }),
  listVersions: (id: string) => request<VersionSummary[]>(`/api/documents/${id}/versions`),
  getVersion: (id: string, no: number) =>
    request<SchemaVersion>(`/api/documents/${id}/versions/${no}`),
  rollback: (id: string, versionNo: number) =>
    request<SchemaDocument>(`/api/documents/${id}/rollback`, {
      method: 'POST',
      body: JSON.stringify({ versionNo }),
    }),
};
