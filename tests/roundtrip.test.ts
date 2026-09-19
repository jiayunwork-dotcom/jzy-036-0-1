import { describe, expect, it } from 'vitest';
import { parseSchemaText } from '../server/src/schema/parser.js';
import { serializeStructure } from '../server/src/schema/serializer.js';
import { canonicalEquals, canonicalize } from '../server/src/schema/canonical.js';
import { SAMPLE_SCHEMA_TEXT } from '../server/src/seed/sampleSchema.js';
import type { FieldNode } from '../shared/types.js';

/**
 * Round-trip invariant: structure -> schema text -> structure must be
 * semantically identical (UI-only ids may differ).
 */

function makeNode(partial: Partial<FieldNode> & Pick<FieldNode, 'name' | 'type'>): FieldNode {
  return {
    id: 'x',
    required: false,
    constraints: {},
    children: [],
    ...partial,
  };
}

const CASES: Array<[string, FieldNode]> = [
  [
    'full-featured object tree',
    makeNode({
      name: '',
      type: 'object',
      children: [
        makeNode({
          name: 'title',
          type: 'string',
          required: true,
          title: '标题',
          constraints: { minLength: 2, maxLength: 30, pattern: '^\\S+$' },
        }),
        makeNode({
          name: 'price',
          type: 'number',
          constraints: { minimum: 0, exclusiveMaximum: 1000 },
          hasDefault: true,
          default: 9.9,
        }),
        makeNode({
          name: 'count',
          type: 'integer',
          constraints: { minimum: 1, maximum: 10 },
        }),
        makeNode({ name: 'flag', type: 'boolean', hasDefault: true, default: false }),
        makeNode({
          name: 'level',
          type: 'string',
          hasEnum: true,
          enum: ['a', 'b', 'c'],
          hasDefault: true,
          default: 'a',
        }),
        makeNode({
          name: 'addr',
          type: 'object',
          children: [
            makeNode({ name: 'city', type: 'string', required: true }),
            makeNode({
              name: 'geo',
              type: 'object',
              children: [
                makeNode({ name: 'lat', type: 'number' }),
                makeNode({ name: 'lng', type: 'number' }),
              ],
            }),
          ],
        }),
        makeNode({
          name: 'tags',
          type: 'array',
          constraints: { minItems: 1, maxItems: 5 },
          items: makeNode({ name: '', type: 'string', constraints: { minLength: 1 } }),
        }),
        makeNode({
          name: 'members',
          type: 'array',
          items: makeNode({
            name: '',
            type: 'object',
            children: [
              makeNode({ name: 'name', type: 'string', required: true }),
              makeNode({ name: 'age', type: 'integer', constraints: { minimum: 0 } }),
            ],
          }),
        }),
      ],
    }),
  ],
  ['bare string root', makeNode({ name: '', type: 'string' })],
  [
    'array root with enum items',
    makeNode({
      name: '',
      type: 'array',
      items: makeNode({ name: '', type: 'integer', hasEnum: true, enum: [1, 2, 3] }),
    }),
  ],
  [
    'empty object',
    makeNode({ name: '', type: 'object', children: [] }),
  ],
];

describe('结构 → Schema 文本 → 结构 往返语义不变', () => {
  for (const [label, structure] of CASES) {
    it(label, () => {
      const text = serializeStructure(structure);
      const parsed = parseSchemaText(text);
      expect(parsed.ok, parsed.ok ? '' : parsed.error).toBe(true);
      if (!parsed.ok) return;
      expect(canonicalEquals(parsed.structure, structure)).toBe(true);
    });
  }
});

describe('文本 → 结构 → 文本 → 结构 同样收敛', () => {
  it('demo schema stabilizes after one canonicalization', () => {
    const first = parseSchemaText(SAMPLE_SCHEMA_TEXT);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = parseSchemaText(serializeStructure(first.structure));
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(canonicalEquals(second.structure, first.structure)).toBe(true);
    // Canonical text is a fixed point: serializing twice gives identical text.
    expect(serializeStructure(second.structure)).toBe(serializeStructure(first.structure));
  });

  it('canonical form ignores UI ids', () => {
    const a = parseSchemaText(SAMPLE_SCHEMA_TEXT);
    const b = parseSchemaText(SAMPLE_SCHEMA_TEXT);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.structure.id).not.toBe(b.structure.id);
    expect(JSON.stringify(canonicalize(a.structure))).toBe(
      JSON.stringify(canonicalize(b.structure)),
    );
  });
});
