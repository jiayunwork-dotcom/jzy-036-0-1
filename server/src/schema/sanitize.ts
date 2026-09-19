import {
  FIELD_TYPES,
  type FieldConstraints,
  type FieldNode,
  type FieldType,
} from '../../../shared/types.js';
import { newNodeId } from './nodeId.js';

/**
 * Tolerant normalization of a structure tree received from the client.
 *
 * The client edits FieldNode trees live, so the payload may be partially
 * formed (empty names, missing arrays, stray constraint types). Sanitizing
 * here keeps the transform engine total: every well-enough-formed tree gets
 * a schema, and genuinely unusable input is rejected by the caller.
 */

const TYPE_SET = new Set<string>(FIELD_TYPES);

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function sanitizeConstraints(raw: unknown): FieldConstraints {
  const out: FieldConstraints = {};
  if (typeof raw !== 'object' || raw === null) return out;
  const c = raw as Record<string, unknown>;
  const intKeys = ['minLength', 'maxLength', 'minItems', 'maxItems'] as const;
  for (const k of intKeys) {
    const n = asNumber(c[k]);
    if (n !== undefined && n >= 0) out[k] = Math.floor(n);
  }
  const numKeys = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum'] as const;
  for (const k of numKeys) {
    const n = asNumber(c[k]);
    if (n !== undefined) out[k] = n;
  }
  const pattern = asString(c.pattern);
  if (pattern !== undefined) out.pattern = pattern;
  return out;
}

export function sanitizeNode(raw: unknown, fallbackName = ''): FieldNode {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

  const type: FieldType =
    typeof src.type === 'string' && TYPE_SET.has(src.type)
      ? (src.type as FieldType)
      : 'string';

  const node: FieldNode = {
    id: asString(src.id) ?? newNodeId(),
    name: asString(src.name) ?? fallbackName,
    type,
    required: src.required === true,
    constraints: sanitizeConstraints(src.constraints),
    children: [],
  };

  const title = asString(src.title);
  if (title !== undefined && title !== '') node.title = title;
  const description = asString(src.description);
  if (description !== undefined && description !== '') node.description = description;

  if (src.hasDefault === true) {
    node.hasDefault = true;
    node.default = src.default ?? null;
  }
  if (src.hasEnum === true && Array.isArray(src.enum)) {
    node.hasEnum = true;
    node.enum = src.enum;
  }

  if (type === 'object') {
    const rawChildren = Array.isArray(src.children) ? src.children : [];
    node.children = rawChildren.map((child) => sanitizeNode(child));
  }

  if (type === 'array') {
    node.items = sanitizeNode(src.items ?? { type: 'string' }, '');
  }

  return node;
}
