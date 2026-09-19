import {
  FIELD_TYPES,
  type FieldNode,
  type FieldType,
  type ParseResult,
} from '../../../shared/types.js';
import { newNodeId } from './nodeId.js';
import { nodeToControl } from './controls.js';
import { nodeToSchema } from './serializer.js';

/**
 * Schema text -> structural model.
 *
 * This is one half of the bidirectional transform engine. It is strict about
 * the supported subset: anything malformed produces a ParseErr with a
 * human-readable reason, and callers (the sync layer) keep the last valid
 * state instead of degrading.
 */

const TYPE_SET = new Set<string>(FIELD_TYPES);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function fail(message: string): ParseResult {
  return { ok: false, error: message };
}

/** Turn a JSON.parse error into "line X, column Y" style feedback. */
function describeJsonError(text: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const posMatch = /position\s+(\d+)/i.exec(msg);
  if (posMatch) {
    const pos = Number(posMatch[1]);
    const upTo = text.slice(0, pos);
    const line = upTo.split('\n').length;
    const col = pos - upTo.lastIndexOf('\n');
    return `JSON 语法错误（第 ${line} 行第 ${col} 列）: ${msg}`;
  }
  return `JSON 语法错误: ${msg}`;
}

interface Ctx {
  path: string;
}

function readOptionalString(
  schema: Record<string, unknown>,
  key: string,
  ctx: Ctx,
): string | undefined {
  const v = schema[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'string') {
    throw new Error(`${ctx.path}: "${key}" 必须是字符串`);
  }
  return v;
}

function readNonNegativeInt(
  schema: Record<string, unknown>,
  key: string,
  ctx: Ctx,
): number | undefined {
  const v = schema[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new Error(`${ctx.path}: "${key}" 必须是非负整数`);
  }
  return v;
}

function readNumber(
  schema: Record<string, unknown>,
  key: string,
  ctx: Ctx,
): number | undefined {
  const v = schema[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || Number.isNaN(v)) {
    throw new Error(`${ctx.path}: "${key}" 必须是数字`);
  }
  return v;
}

function inferType(schema: Record<string, unknown>): FieldType {
  if (isPlainObject(schema.properties)) return 'object';
  if (schema.items !== undefined) return 'array';
  return 'string';
}

/** Recursively convert a JSON Schema object into a FieldNode. Throws on invalid input. */
export function schemaToNode(
  schema: unknown,
  name: string,
  required: boolean,
  path: string,
): FieldNode {
  const ctx: Ctx = { path: path || '(根)' };
  if (!isPlainObject(schema)) {
    throw new Error(`${ctx.path}: schema 必须是一个 JSON 对象`);
  }

  let type: FieldType;
  if (schema.type === undefined) {
    type = inferType(schema);
  } else if (typeof schema.type === 'string' && TYPE_SET.has(schema.type)) {
    type = schema.type as FieldType;
  } else {
    throw new Error(
      `${ctx.path}: 不支持的 type ${JSON.stringify(schema.type)}，仅支持 ${FIELD_TYPES.join('/')}`,
    );
  }

  const node: FieldNode = {
    id: newNodeId(),
    name,
    type,
    required,
    constraints: {},
    children: [],
  };

  const title = readOptionalString(schema, 'title', ctx);
  if (title !== undefined) node.title = title;
  const description = readOptionalString(schema, 'description', ctx);
  if (description !== undefined) node.description = description;

  if ('default' in schema) {
    node.hasDefault = true;
    node.default = schema.default;
  }

  if (schema.enum !== undefined) {
    if (!Array.isArray(schema.enum) || schema.enum.length === 0) {
      throw new Error(`${ctx.path}: "enum" 必须是非空数组`);
    }
    node.hasEnum = true;
    node.enum = schema.enum;
  }

  if (type === 'string') {
    const minLength = readNonNegativeInt(schema, 'minLength', ctx);
    if (minLength !== undefined) node.constraints.minLength = minLength;
    const maxLength = readNonNegativeInt(schema, 'maxLength', ctx);
    if (maxLength !== undefined) node.constraints.maxLength = maxLength;
    const pattern = readOptionalString(schema, 'pattern', ctx);
    if (pattern !== undefined) {
      try {
        new RegExp(pattern);
      } catch {
        throw new Error(`${ctx.path}: "pattern" 不是合法的正则表达式: ${pattern}`);
      }
      node.constraints.pattern = pattern;
    }
  }

  if (type === 'number' || type === 'integer') {
    for (const key of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum'] as const) {
      const v = readNumber(schema, key, ctx);
      if (v !== undefined) node.constraints[key] = v;
    }
  }

  if (type === 'object') {
    const rawProps = schema.properties ?? {};
    if (!isPlainObject(rawProps)) {
      throw new Error(`${ctx.path}: "properties" 必须是对象`);
    }
    const rawRequired = schema.required ?? [];
    if (
      !Array.isArray(rawRequired) ||
      rawRequired.some((r) => typeof r !== 'string')
    ) {
      throw new Error(`${ctx.path}: "required" 必须是字符串数组`);
    }
    const requiredSet = new Set<string>(rawRequired as string[]);
    for (const [childName, childSchema] of Object.entries(rawProps)) {
      const childPath = path ? `${path}.${childName}` : childName;
      node.children.push(
        schemaToNode(childSchema, childName, requiredSet.has(childName), childPath),
      );
    }
  }

  if (type === 'array') {
    const minItems = readNonNegativeInt(schema, 'minItems', ctx);
    if (minItems !== undefined) node.constraints.minItems = minItems;
    const maxItems = readNonNegativeInt(schema, 'maxItems', ctx);
    if (maxItems !== undefined) node.constraints.maxItems = maxItems;
    const itemPath = path ? `${path}[]` : '[]';
    if (schema.items === undefined) {
      node.items = schemaToNode({ type: 'string' }, '', false, itemPath);
    } else if (Array.isArray(schema.items)) {
      throw new Error(`${ctx.path}: 不支持数组形式的 "items"（元组），请使用单一 schema`);
    } else {
      node.items = schemaToNode(schema.items, '', false, itemPath);
    }
  }

  return node;
}

/** Parse raw schema text into the structural model + control tree. */
export function parseSchemaText(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return fail(describeJsonError(text, err));
  }
  try {
    const structure = schemaToNode(raw, '', false, '');
    return {
      ok: true,
      structure,
      controls: nodeToControl(structure),
      canonicalText: JSON.stringify(nodeToSchema(structure), null, 2),
    };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
