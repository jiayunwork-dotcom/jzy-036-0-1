import type { FieldNode, ValidationError } from '../../../shared/types.js';

/**
 * Form-data validation against the structural model.
 *
 * Every constraint the visual editor can express is enforced here: required,
 * string length, regex pattern, numeric bounds (inclusive & exclusive),
 * enum membership, array size, plus type checks. Errors carry a dot path so
 * the preview form can pin each message to its field.
 */

function label(node: FieldNode): string {
  return node.title || node.name || '(根)';
}

function join(path: string, seg: string): string {
  return path ? `${path}.${seg}` : seg;
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

function jsonEq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function validateNode(node: FieldNode, value: unknown, path: string, errors: ValidationError[]): void {
  const name = label(node);

  if (isEmpty(value)) {
    // An empty optional field is simply absent; a required one is an error.
    if (node.required) {
      errors.push({ path, message: `「${name}」为必填项` });
    }
    return;
  }

  switch (node.type) {
    case 'string': {
      if (typeof value !== 'string') {
        errors.push({ path, message: `「${name}」必须是字符串` });
        return;
      }
      const { minLength, maxLength, pattern } = node.constraints;
      if (minLength !== undefined && value.length < minLength) {
        errors.push({ path, message: `「${name}」长度不能少于 ${minLength} 个字符` });
      }
      if (maxLength !== undefined && value.length > maxLength) {
        errors.push({ path, message: `「${name}」长度不能超过 ${maxLength} 个字符` });
      }
      if (pattern !== undefined && pattern !== '') {
        try {
          if (!new RegExp(pattern).test(value)) {
            errors.push({ path, message: `「${name}」不匹配格式 ${pattern}` });
          }
        } catch {
          // Pattern was validated at parse time; ignore defensively.
        }
      }
      break;
    }
    case 'number':
    case 'integer': {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        errors.push({ path, message: `「${name}」必须是数字` });
        return;
      }
      if (node.type === 'integer' && !Number.isInteger(value)) {
        errors.push({ path, message: `「${name}」必须是整数` });
      }
      const { minimum, maximum, exclusiveMinimum, exclusiveMaximum } = node.constraints;
      if (minimum !== undefined && value < minimum) {
        errors.push({ path, message: `「${name}」不能小于 ${minimum}` });
      }
      if (maximum !== undefined && value > maximum) {
        errors.push({ path, message: `「${name}」不能大于 ${maximum}` });
      }
      if (exclusiveMinimum !== undefined && value <= exclusiveMinimum) {
        errors.push({ path, message: `「${name}」必须大于 ${exclusiveMinimum}` });
      }
      if (exclusiveMaximum !== undefined && value >= exclusiveMaximum) {
        errors.push({ path, message: `「${name}」必须小于 ${exclusiveMaximum}` });
      }
      break;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') {
        errors.push({ path, message: `「${name}」必须是布尔值` });
      }
      break;
    }
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        errors.push({ path, message: `「${name}」必须是对象` });
        return;
      }
      const record = value as Record<string, unknown>;
      for (const child of node.children) {
        validateNode(child, record[child.name], join(path, child.name), errors);
      }
      break;
    }
    case 'array': {
      if (!Array.isArray(value)) {
        errors.push({ path, message: `「${name}」必须是数组` });
        return;
      }
      const { minItems, maxItems } = node.constraints;
      if (minItems !== undefined && value.length < minItems) {
        errors.push({ path, message: `「${name}」至少需要 ${minItems} 项` });
      }
      if (maxItems !== undefined && value.length > maxItems) {
        errors.push({ path, message: `「${name}」最多允许 ${maxItems} 项` });
      }
      if (node.items) {
        value.forEach((item, i) => {
          validateNode(node.items!, item, join(path, String(i)), errors);
        });
      }
      break;
    }
  }

  // Enum membership applies on top of the type checks (any scalar type).
  if (node.hasEnum && node.enum && !isEmpty(value)) {
    if (!node.enum.some((option) => jsonEq(option, value))) {
      errors.push({
        path,
        message: `「${name}」必须是 ${node.enum.map((o) => JSON.stringify(o)).join(' / ')} 之一`,
      });
    }
  }
}

export function validateData(root: FieldNode, data: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  validateNode(root, data, '', errors);
  return errors;
}
