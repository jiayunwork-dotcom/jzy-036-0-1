/**
 * Shared types used by both the client and the server.
 *
 * `FieldNode` is the normalized, UI-friendly structural model of a JSON
 * Schema. The server owns the bidirectional transform between `FieldNode`
 * trees and JSON Schema text; the client renders/edits `FieldNode` trees.
 */

export type FieldType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array';

export const FIELD_TYPES: FieldType[] = [
  'string',
  'number',
  'integer',
  'boolean',
  'object',
  'array',
];

export interface FieldConstraints {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minItems?: number;
  maxItems?: number;
}

export interface FieldNode {
  /** UI-only identity (keying, focus). Stripped when comparing semantics. */
  id: string;
  /** Property key inside the parent object. Empty for the root / array items. */
  name: string;
  type: FieldType;
  required: boolean;
  title?: string;
  description?: string;
  hasDefault?: boolean;
  default?: unknown;
  hasEnum?: boolean;
  enum?: unknown[];
  constraints: FieldConstraints;
  /** Children for type === 'object'. */
  children: FieldNode[];
  /** Item schema for type === 'array'. */
  items?: FieldNode;
}

export type ControlKind =
  | 'text'
  | 'number'
  | 'checkbox'
  | 'select'
  | 'object'
  | 'array';

export interface ControlNode {
  /** Matches the id of the FieldNode it was derived from. */
  id: string;
  name: string;
  control: ControlKind;
  required: boolean;
  title?: string;
  description?: string;
  default?: unknown;
  hasDefault?: boolean;
  options?: unknown[];
  constraints: FieldConstraints;
  children?: ControlNode[];
  item?: ControlNode;
}

export interface ParseOk {
  ok: true;
  structure: FieldNode;
  controls: ControlNode;
  /** Canonical pretty-printed schema text. */
  canonicalText: string;
}

export interface ParseErr {
  ok: false;
  error: string;
}

export type ParseResult = ParseOk | ParseErr;

export interface ValidationError {
  /** Dot path, numeric segments for array indices, e.g. "address.zip" / "tags.0". */
  path: string;
  message: string;
}

export interface DocumentSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchemaDocument extends DocumentSummary {
  content: string;
}

export interface VersionSummary {
  versionNo: number;
  createdAt: string;
  /** First line of the content, as a cheap label. */
  preview: string;
}

export interface SchemaVersion extends VersionSummary {
  documentId: string;
  content: string;
}
