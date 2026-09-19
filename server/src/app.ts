import express, { type Express } from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSchemaRouter } from './routes/schema.js';
import { createDocumentsRouter } from './routes/documents.js';
import { DocumentStore } from './store/documents.js';
import { SAMPLE_DOCUMENT_NAME, SAMPLE_SCHEMA_TEXT } from './seed/sampleSchema.js';

export interface AppContext {
  app: Express;
  store: DocumentStore;
}

/** Seed the demo document on an empty database so the UI is explorable immediately. */
export function seedIfEmpty(store: DocumentStore): void {
  if (store.list().length === 0) {
    store.create(SAMPLE_DOCUMENT_NAME, SAMPLE_SCHEMA_TEXT);
  }
}

export function createApp(dbPath?: string, opts: { seed?: boolean } = {}): AppContext {
  const store = new DocumentStore(dbPath);
  if (opts.seed !== false) seedIfEmpty(store);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/schema', createSchemaRouter());
  app.use('/api/documents', createDocumentsRouter(store));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: '接口不存在' });
  });

  // In production the server also hosts the built client. Resolve the dist
  // folder relative to this file first (layout-independent), then the cwd.
  const candidates = [
    fileURLToPath(new URL('../../client/dist', import.meta.url)),
    resolve(process.cwd(), 'client', 'dist'),
  ];
  const clientDist = candidates.find((p) => existsSync(p));
  if (clientDist) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(resolve(clientDist, 'index.html')));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use(((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }) as express.ErrorRequestHandler);

  return { app, store };
}
