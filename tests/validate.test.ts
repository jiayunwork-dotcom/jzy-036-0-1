import { describe, expect, it } from 'vitest';
import { parseSchemaText } from '../server/src/schema/parser.js';
import { validateData } from '../server/src/schema/validate.js';
import { SAMPLE_SCHEMA_TEXT } from '../server/src/seed/sampleSchema.js';
import type { FieldNode, ValidationError } from '../shared/types.js';

/** Constraint enforcement: violating input is blocked & located, valid input passes. */

function structureOf(text: string): FieldNode {
  const r = parseSchemaText(text);
  if (!r.ok) throw new Error(`schema should parse: ${r.error}`);
  return r.structure;
}

const root = structureOf(SAMPLE_SCHEMA_TEXT);

function paths(errors: ValidationError[]): string[] {
  return errors.map((e) => e.path).sort();
}

describe('预览表单的约束校验（基于示范报名表 Schema）', () => {
  const validData = {
    name: '张三',
    email: 'zhang@example.com',
    age: 30,
    ticketType: 'vip',
    subscribe: true,
    address: { city: '上海', zip: '200000' },
    companions: [{ name: '李四', relation: '朋友' }],
    tags: ['音乐', '户外'],
  };

  it('完全合法的数据被放行', () => {
    expect(validateData(root, validData)).toEqual([]);
  });

  it('缺失必填字段被拦下并定位到字段', () => {
    const { name: _n, email: _e, ...rest } = validData;
    const errors = validateData(root, rest);
    expect(paths(errors)).toEqual(['email', 'name']);
    expect(errors.find((e) => e.path === 'name')?.message).toContain('必填');
  });

  it('字符串长度约束生效', () => {
    const errors = validateData(root, { ...validData, name: '张' });
    expect(paths(errors)).toEqual(['name']);
    expect(errors[0]?.message).toContain('2');
  });

  it('正则模式约束生效', () => {
    const errors = validateData(root, { ...validData, email: 'not-an-email' });
    expect(paths(errors)).toEqual(['email']);
    expect(errors[0]?.message).toContain('不匹配格式');
  });

  it('数值上下界约束生效', () => {
    expect(paths(validateData(root, { ...validData, age: 17 }))).toEqual(['age']);
    expect(paths(validateData(root, { ...validData, age: 121 }))).toEqual(['age']);
    expect(validateData(root, { ...validData, age: 18 })).toEqual([]);
  });

  it('整数类型拒绝小数', () => {
    const errors = validateData(root, { ...validData, age: 30.5 });
    expect(paths(errors)).toEqual(['age']);
    expect(errors[0]?.message).toContain('整数');
  });

  it('枚举取值约束生效', () => {
    const errors = validateData(root, { ...validData, ticketType: 'platinum' });
    expect(paths(errors)).toEqual(['ticketType']);
    expect(errors[0]?.message).toContain('之一');
  });

  it('嵌套对象的约束错误带完整路径', () => {
    const errors = validateData(root, {
      ...validData,
      address: { city: '上海', zip: 'abc' },
    });
    expect(paths(errors)).toEqual(['address.zip']);
  });

  it('嵌套对象缺失必填子字段', () => {
    const errors = validateData(root, { ...validData, address: { zip: '200000' } });
    expect(paths(errors)).toEqual(['address.city']);
  });

  it('数组项数约束生效', () => {
    const tooMany = {
      ...validData,
      companions: [
        { name: '甲一' },
        { name: '乙二' },
        { name: '丙三' },
        { name: '丁四' },
      ],
    };
    const errors = validateData(root, tooMany);
    expect(paths(errors)).toEqual(['companions']);
    expect(errors[0]?.message).toContain('3');
  });

  it('数组子项的约束错误定位到具体下标', () => {
    const errors = validateData(root, {
      ...validData,
      companions: [{ name: '李' }, { relation: '同事' }],
    });
    expect(paths(errors)).toEqual(['companions.0.name', 'companions.1.name']);
  });

  it('可选字段留空不报错', () => {
    const { age: _a, address: _addr, companions: _c, tags: _t, ...rest } = validData;
    expect(validateData(root, rest)).toEqual([]);
  });
});

describe('边界与类型检查', () => {
  it('exclusiveMinimum / exclusiveMaximum', () => {
    const s = structureOf(
      '{ "type": "object", "properties": { "score": { "type": "number", "exclusiveMinimum": 0, "exclusiveMaximum": 100 } } }',
    );
    expect(validateData(s, { score: 0 })).toHaveLength(1);
    expect(validateData(s, { score: 100 })).toHaveLength(1);
    expect(validateData(s, { score: 50 })).toEqual([]);
  });

  it('类型错误被报出', () => {
    const s = structureOf(
      '{ "type": "object", "properties": { "n": { "type": "number" }, "b": { "type": "boolean" } } }',
    );
    const errors = validateData(s, { n: 'abc', b: 'yes' });
    expect(paths(errors)).toEqual(['b', 'n']);
  });

  it('数字枚举按值匹配', () => {
    const s = structureOf('{ "type": "integer", "enum": [1, 2, 3] }');
    expect(validateData(s, 2)).toEqual([]);
    expect(validateData(s, 4)).toHaveLength(1);
  });
});
