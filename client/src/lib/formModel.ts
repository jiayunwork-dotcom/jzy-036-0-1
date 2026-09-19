import type { ControlNode } from '../../../shared/types';

/**
 * Form-data model helpers for the preview pane.
 * Data is a plain nested object/array tree addressed by dot paths
 * (numeric segments index into arrays), matching the server's validator.
 */

export function getPath(root: unknown, path: string): unknown {
  if (path === '') return root;
  let cur: unknown = root;
  for (const seg of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

export function setPath(root: unknown, path: string, value: unknown): void {
  const segs = path.split('.');
  let cur = root as Record<string, unknown>;
  for (let i = 0; i < segs.length - 1; i++) {
    cur = cur[segs[i]!] as Record<string, unknown>;
  }
  cur[segs[segs.length - 1]!] = value;
}

function defaultFor(node: ControlNode): unknown {
  if (node.hasDefault) return node.default;
  switch (node.control) {
    case 'object':
      return buildInitialData(node);
    case 'array':
      return [];
    case 'checkbox':
      return false;
    case 'number':
      return null;
    case 'select':
      return null;
    default:
      return '';
  }
}

/** Initial form data for a control tree (defaults applied, objects expanded). */
export function buildInitialData(root: ControlNode): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const child of root.children ?? []) {
    data[child.name] = defaultFor(child);
  }
  return data;
}

/**
 * Rebuild form data when the schema changes, preserving existing values at
 * paths that still exist so typing in the text pane doesn't wipe the form.
 */
export function mergeData(root: ControlNode, oldData: unknown): Record<string, unknown> {
  const fresh = buildInitialData(root);
  if (typeof oldData !== 'object' || oldData === null) return fresh;

  const keep = (node: ControlNode, path: string, target: Record<string, unknown>): void => {
    for (const child of node.children ?? []) {
      const childPath = path ? `${path}.${child.name}` : child.name;
      const oldVal = getPath(oldData, childPath);
      if (oldVal !== undefined) {
        if (child.control === 'object') {
          const merged: Record<string, unknown> = {};
          keep(child, childPath, merged);
          setPath(fresh, childPath, merged);
        } else if (child.control === 'array' && Array.isArray(oldVal)) {
          setPath(fresh, childPath, oldVal);
        } else {
          setPath(fresh, childPath, oldVal);
        }
      }
      void target;
    }
  };
  keep(root, '', fresh);
  return fresh;
}

/** Empty item value for "add row" in an array control. */
export function emptyItem(item: ControlNode): unknown {
  return defaultFor(item);
}
