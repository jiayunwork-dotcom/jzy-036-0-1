import type { FieldNode } from '../../../shared/types.js';

/**
 * Structural model -> JSON Schema. This is the other half of the
 * bidirectional transform engine.
 *
 * Keys are emitted in a fixed, human-friendly order so the generated text is
 * stable (diff-friendly) and parsing it back yields an equivalent structure
 * — the round-trip invariant the test-suite guards.
 */

export type SchemaObject = Record<string, unknown>;

export function nodeToSchema(node: FieldNode): SchemaObject {
  const schema: SchemaObject = { type: node.type };

  if (node.title !== undefined && node.title !== '') schema.title = node.title;
  if (node.description !== undefined && node.description !== '') {
    schema.description = node.description;
  }
  if (node.hasDefault) schema.default = node.default ?? null;
  if (node.hasEnum && Array.isArray(node.enum)) schema.enum = node.enum;

  const c = node.constraints ?? {};
  if (node.type === 'string') {
    if (c.minLength !== undefined) schema.minLength = c.minLength;
    if (c.maxLength !== undefined) schema.maxLength = c.maxLength;
    if (c.pattern !== undefined && c.pattern !== '') schema.pattern = c.pattern;
  }
  if (node.type === 'number' || node.type === 'integer') {
    if (c.minimum !== undefined) schema.minimum = c.minimum;
    if (c.maximum !== undefined) schema.maximum = c.maximum;
    if (c.exclusiveMinimum !== undefined) schema.exclusiveMinimum = c.exclusiveMinimum;
    if (c.exclusiveMaximum !== undefined) schema.exclusiveMaximum = c.exclusiveMaximum;
  }

  if (node.type === 'object') {
    const properties: Record<string, SchemaObject> = {};
    const required: string[] = [];
    for (const child of node.children ?? []) {
      properties[child.name] = nodeToSchema(child);
      if (child.required) required.push(child.name);
    }
    schema.properties = properties;
    if (required.length > 0) schema.required = required;
  }

  if (node.type === 'array') {
    if (c.minItems !== undefined) schema.minItems = c.minItems;
    if (c.maxItems !== undefined) schema.maxItems = c.maxItems;
    schema.items = node.items
      ? nodeToSchema(node.items)
      : ({ type: 'string' } satisfies SchemaObject);
  }

  return schema;
}

/** Canonical pretty-printed schema text for a structure. */
export function serializeStructure(root: FieldNode): string {
  return JSON.stringify(nodeToSchema(root), null, 2);
}
