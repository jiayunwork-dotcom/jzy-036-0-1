import type { ControlNode, FieldNode } from '../../../shared/types.js';

/**
 * Control mapping: structural model -> form control tree.
 *
 *   string            -> text input
 *   number / integer  -> number input
 *   boolean           -> checkbox
 *   enum (any type)   -> select dropdown
 *   object            -> nested fieldset group
 *   array             -> repeatable add/remove list
 */
export function nodeToControl(node: FieldNode): ControlNode {
  const base: ControlNode = {
    id: node.id,
    name: node.name,
    control: controlKind(node),
    required: node.required,
    constraints: { ...node.constraints },
  };
  if (node.title !== undefined) base.title = node.title;
  if (node.description !== undefined) base.description = node.description;
  if (node.hasDefault) {
    base.hasDefault = true;
    base.default = node.default;
  }
  if (node.hasEnum && node.enum) base.options = node.enum;

  if (node.type === 'object') {
    base.children = node.children.map(nodeToControl);
  }
  if (node.type === 'array' && node.items) {
    base.item = nodeToControl(node.items);
  }
  return base;
}

function controlKind(node: FieldNode): ControlNode['control'] {
  if (node.hasEnum) return 'select';
  switch (node.type) {
    case 'boolean':
      return 'checkbox';
    case 'number':
    case 'integer':
      return 'number';
    case 'object':
      return 'object';
    case 'array':
      return 'array';
    default:
      return 'text';
  }
}
