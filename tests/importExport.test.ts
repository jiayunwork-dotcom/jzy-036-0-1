import { describe, expect, it } from 'vitest';
import { parseSchemaText } from '../server/src/schema/parser.js';
import { serializeStructure } from '../server/src/schema/serializer.js';
import { canonicalEquals } from '../server/src/schema/canonical.js';
import { SAMPLE_SCHEMA_TEXT } from '../server/src/seed/sampleSchema.js';

/** Export -> import equivalence, and importing external schemas. */

describe('导出再导入得到等价结构', () => {
  it('示范 Schema 导出（规范化文本）再导入，结构语义不变', () => {
    const first = parseSchemaText(SAMPLE_SCHEMA_TEXT);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // "导出"：当前结构序列化为规范文本；"导入"：重新解析该文本。
    const exported = serializeStructure(first.structure);
    const reimported = parseSchemaText(exported);
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;

    expect(canonicalEquals(reimported.structure, first.structure)).toBe(true);
    // 再导出一次，文本完全一致（导出是幂等的）。
    expect(serializeStructure(reimported.structure)).toBe(exported);
  });
});

describe('导入外部 Schema', () => {
  it('外部 Schema 铺开为结构，未知关键字被忽略而不报错', () => {
    const external = JSON.stringify({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      title: '外部问卷',
      properties: {
        email: { type: 'string', format: 'email', minLength: 5 },
        age: { type: 'integer', minimum: 0, examples: [20] },
        tags: { type: 'array', items: { type: 'string' }, uniqueItems: true },
      },
      required: ['email'],
      additionalProperties: false,
    });
    const r = parseSchemaText(external);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.structure.title).toBe('外部问卷');
    const [email, age, tags] = r.structure.children;
    expect(email?.required).toBe(true);
    expect(email?.constraints.minLength).toBe(5);
    expect(age?.constraints.minimum).toBe(0);
    expect(tags?.type).toBe('array');
    expect(tags?.items?.type).toBe('string');

    // 导入后再导出仍是合法 Schema，且再次导入结构不变。
    const round = parseSchemaText(serializeStructure(r.structure));
    expect(round.ok).toBe(true);
    if (!round.ok) return;
    expect(canonicalEquals(round.structure, r.structure)).toBe(true);
  });

  it('非法的外部 Schema 给出明确错误而不是崩溃', () => {
    const r = parseSchemaText('{ "type": "object", "properties": { "a": 42 } }');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('a');
  });
});
