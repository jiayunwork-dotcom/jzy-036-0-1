import { describe, expect, it } from 'vitest';
import { parseSchemaText } from '../server/src/schema/parser.js';

/** Parser: clear, located errors for invalid input; strict subset checks. */

describe('非法输入的判定与原因', () => {
  it('JSON 语法错误带出行列信息', () => {
    const r = parseSchemaText('{\n  "type": "object",\n}');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('JSON 语法错误');
    expect(r.error).toMatch(/第 \d+ 行/);
  });

  it('顶层不是对象', () => {
    const r = parseSchemaText('[1, 2, 3]');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('schema 必须是一个 JSON 对象');
  });

  it('不支持的 type', () => {
    const r = parseSchemaText('{ "type": "null" }');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('不支持的 type');
  });

  it('required 不是字符串数组', () => {
    const r = parseSchemaText('{ "type": "object", "properties": {}, "required": "name" }');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('"required" 必须是字符串数组');
  });

  it('enum 必须是非空数组', () => {
    const r = parseSchemaText('{ "type": "string", "enum": [] }');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('"enum" 必须是非空数组');
  });

  it('minLength 必须是非负整数', () => {
    const r = parseSchemaText('{ "type": "string", "minLength": -1 }');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('"minLength" 必须是非负整数');
  });

  it('pattern 必须是合法正则', () => {
    const r = parseSchemaText('{ "type": "string", "pattern": "([a-z" }');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('不是合法的正则表达式');
  });

  it('嵌套字段的错误带有路径定位', () => {
    const r = parseSchemaText(
      '{ "type": "object", "properties": { "addr": { "type": "object", "properties": { "zip": { "type": "string", "maxLength": "6" } } } } }',
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('addr.zip');
  });

  it('数组形式的 items（元组）被拒绝', () => {
    const r = parseSchemaText('{ "type": "array", "items": [{ "type": "string" }] }');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('items');
  });
});

describe('合法输入的解析', () => {
  it('缺失 type 时按特征推断', () => {
    const r = parseSchemaText('{ "properties": { "a": { "type": "string" } } }');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.structure.type).toBe('object');
  });

  it('required 标记落到子节点上', () => {
    const r = parseSchemaText(
      '{ "type": "object", "properties": { "a": { "type": "string" }, "b": { "type": "string" } }, "required": ["a"] }',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [a, b] = r.structure.children;
    expect(a?.required).toBe(true);
    expect(b?.required).toBe(false);
  });

  it('解析结果同时给出控件树与规范化文本', () => {
    const r = parseSchemaText('{ "type": "string", "enum": ["x", "y"] }');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.controls.control).toBe('select');
    expect(JSON.parse(r.canonicalText)).toEqual({ type: 'string', enum: ['x', 'y'] });
  });
});
