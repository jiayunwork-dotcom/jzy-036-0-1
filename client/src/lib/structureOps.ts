import type { FieldNode, FieldType } from '../../../shared/types';

/**
 * Pure tree operations for the visual structure editor. Every operation
 * returns a new tree (the old one is never mutated), which keeps Vue
 * reactivity trivial and gives the sync controller clean identities.
 */

export function newId(): string {
  return crypto.randomUUID();
}

export function cloneNode(node: FieldNode): FieldNode {
  return structuredClone(node);
}

export function createNode(type: FieldType, name = ''): FieldNode {
  const node: FieldNode = {
    id: newId(),
    name,
    type,
    required: false,
    constraints: {},
    children: [],
  };
  if (type === 'array') {
    node.items = createNode('string', '');
  }
  return node;
}

/** Apply a mutation to the node with the given id; returns a new root. */
export function updateNode(
  root: FieldNode,
  id: string,
  mutate: (node: FieldNode) => void,
): FieldNode {
  const copy = cloneNode(root);
  const target = findNode(copy, id);
  if (target) mutate(target);
  return copy;
}

export function findNode(root: FieldNode, id: string): FieldNode | null {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const hit = findNode(child, id);
    if (hit) return hit;
  }
  if (root.items) {
    const hit = findNode(root.items, id);
    if (hit) return hit;
  }
  return null;
}

export function removeNode(root: FieldNode, id: string): FieldNode {
  const copy = cloneNode(root);
  removeFrom(copy, id);
  return copy;
}

function removeFrom(parent: FieldNode, id: string): boolean {
  const idx = parent.children.findIndex((c) => c.id === id);
  if (idx >= 0) {
    parent.children.splice(idx, 1);
    return true;
  }
  for (const child of parent.children) {
    if (removeFrom(child, id)) return true;
  }
  return false;
}

/**
 * Change a node's type, keeping name/required/title/description and any
 * constraints that still apply, and resetting type-specific structure.
 */
export function changeType(node: FieldNode, type: FieldType): void {
  if (node.type === type) return;
  node.type = type;
  const c = node.constraints;
  node.constraints = {};
  if (type === 'string') {
    if (c.minLength !== undefined) node.constraints.minLength = c.minLength;
    if (c.maxLength !== undefined) node.constraints.maxLength = c.maxLength;
    if (c.pattern !== undefined) node.constraints.pattern = c.pattern;
  }
  if (type === 'number' || type === 'integer') {
    for (const k of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum'] as const) {
      if (c[k] !== undefined) node.constraints[k] = c[k];
    }
  }
  if (type === 'array') {
    if (c.minItems !== undefined) node.constraints.minItems = c.minItems;
    if (c.maxItems !== undefined) node.constraints.maxItems = c.maxItems;
    node.items = createNode('string', '');
    node.children = [];
  } else if (type === 'object') {
    node.children = [];
    delete node.items;
  } else {
    node.children = [];
    delete node.items;
  }
}

/** Parse one enum option per line: JSON when it parses, plain string otherwise. */
export function parseEnumLines(text: string): unknown[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      try {
        return JSON.parse(line) as unknown;
      } catch {
        return line;
      }
    });
}

export function enumToLines(values: unknown[]): string {
  return values
    .map((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
    .join('\n');
}

/** Parse a default-value input: JSON when it parses, plain string otherwise. */
export function parseDefaultInput(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}
