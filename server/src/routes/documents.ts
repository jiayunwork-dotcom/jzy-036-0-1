import { Router } from 'express';
import type { DocumentStore } from '../store/documents.js';

/**
 * Document & version API.
 *
 *   GET    /api/documents                     list summaries
 *   POST   /api/documents                     { name, content? }      -> created doc
 *   GET    /api/documents/:id                 full document
 *   PUT    /api/documents/:id                 { name?, content? }     -> updated doc (content change = new version)
 *   DELETE /api/documents/:id
 *   GET    /api/documents/:id/versions        version summaries (newest first)
 *   GET    /api/documents/:id/versions/:no    one version with content
 *   POST   /api/documents/:id/rollback        { versionNo }           -> doc restored to that version
 */
export function createDocumentsRouter(store: DocumentStore): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(store.list());
  });

  router.post('/', (req, res) => {
    const body = req.body as { name?: unknown; content?: unknown };
    const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : null;
    if (!name) {
      res.status(400).json({ error: '请求体需要 { name: string }' });
      return;
    }
    const content =
      typeof body.content === 'string' && body.content.trim()
        ? body.content
        : '{\n  "type": "object",\n  "properties": {}\n}';
    res.status(201).json(store.create(name, content));
  });

  router.get('/:id', (req, res) => {
    const doc = store.get(req.params.id!);
    if (!doc) {
      res.status(404).json({ error: '文档不存在' });
      return;
    }
    res.json(doc);
  });

  router.put('/:id', (req, res) => {
    const body = req.body as { name?: unknown; content?: unknown };
    const patch: { name?: string; content?: string } = {};
    if (typeof body?.name === 'string' && body.name.trim()) patch.name = body.name.trim();
    if (typeof body?.content === 'string') patch.content = body.content;
    const doc = store.update(req.params.id!, patch);
    if (!doc) {
      res.status(404).json({ error: '文档不存在' });
      return;
    }
    res.json(doc);
  });

  router.delete('/:id', (req, res) => {
    if (!store.remove(req.params.id!)) {
      res.status(404).json({ error: '文档不存在' });
      return;
    }
    res.status(204).end();
  });

  router.get('/:id/versions', (req, res) => {
    if (!store.get(req.params.id!)) {
      res.status(404).json({ error: '文档不存在' });
      return;
    }
    res.json(store.listVersions(req.params.id!));
  });

  router.get('/:id/versions/:no', (req, res) => {
    const version = store.getVersion(req.params.id!, Number(req.params.no));
    if (!version) {
      res.status(404).json({ error: '版本不存在' });
      return;
    }
    res.json(version);
  });

  router.post('/:id/rollback', (req, res) => {
    const versionNo = Number((req.body as { versionNo?: unknown })?.versionNo);
    if (!Number.isInteger(versionNo)) {
      res.status(400).json({ error: '请求体需要 { versionNo: number }' });
      return;
    }
    const doc = store.rollback(req.params.id!, versionNo);
    if (!doc) {
      res.status(404).json({ error: '文档或版本不存在' });
      return;
    }
    res.json(doc);
  });

  return router;
}
