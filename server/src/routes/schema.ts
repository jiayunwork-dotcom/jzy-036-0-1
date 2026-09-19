import { Router } from 'express';
import { parseSchemaText } from '../schema/parser.js';
import { serializeStructure } from '../schema/serializer.js';
import { sanitizeNode } from '../schema/sanitize.js';
import { nodeToControl } from '../schema/controls.js';
import { validateData } from '../schema/validate.js';

/**
 * Transform & validation API — the server-side engine behind the two-pane
 * sync and the live preview.
 *
 *   POST /api/schema/parse          { text }                -> ParseResult
 *   POST /api/schema/serialize      { structure }           -> { text, controls }
 *   POST /api/schema/validate-data  { structure, data }     -> { errors }
 */
export function createSchemaRouter(): Router {
  const router = Router();

  router.post('/parse', (req, res) => {
    const text = (req.body as { text?: unknown })?.text;
    if (typeof text !== 'string') {
      res.status(400).json({ ok: false, error: '请求体需要 { text: string }' });
      return;
    }
    res.json(parseSchemaText(text));
  });

  router.post('/serialize', (req, res) => {
    const structure = (req.body as { structure?: unknown })?.structure;
    if (typeof structure !== 'object' || structure === null) {
      res.status(400).json({ error: '请求体需要 { structure: FieldNode }' });
      return;
    }
    const root = sanitizeNode(structure);
    res.json({ text: serializeStructure(root), controls: nodeToControl(root) });
  });

  router.post('/validate-data', (req, res) => {
    const body = req.body as { structure?: unknown; data?: unknown };
    if (typeof body?.structure !== 'object' || body.structure === null) {
      res.status(400).json({ error: '请求体需要 { structure: FieldNode, data: unknown }' });
      return;
    }
    const root = sanitizeNode(body.structure);
    res.json({ errors: validateData(root, body.data) });
  });

  return router;
}
