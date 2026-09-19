import type { FieldNode } from '../../../shared/types.js';

/**
 * Semantic fingerprint of a structure tree: every meaningful field, in
 * order, with UI-only identities removed. Two structures are semantically
 * equal iff their canonical forms are deep-equal — this is the predicate
 * the round-trip tests assert on.
 */
export function canonicalize(node: FieldNode): unknown {
  const out: Record<string, unknown> = {
    name: node.name,
    type: node.type,
    required: node.required === true,
  };
  if (node.title !== undefined && node.title !== '') out.title = node.title;
  if (node.description !== undefined && node.description !== '') {
    out.description = node.description;
  }
  if (node.hasDefault) out.default = node.default ?? null;
  if (node.hasEnum) out.enum = node.enum ?? [];
  const c = node.constraints ?? {};
  const constraints: Record<string, unknown> = {};
  for (const key of [
    'minLength',
    'maxLength',
    'pattern',
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'minItems',
    'maxItems',
  ] as const) {
    if (c[key] !== undefined) constraints[key] = c[key];
  }
  if (Object.keys(constraints).length > 0) out.constraints = constraints;
  if (node.type === 'object') {
    out.children = (node.children ?? []).map(canonicalize);
  }
  if (node.type === 'array') {
    out.items = node.items ? canonicalize(node.items) : null;
  }
  return out;
}

export function canonicalEquals(a: FieldNode, b: FieldNode): boolean {
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
}
