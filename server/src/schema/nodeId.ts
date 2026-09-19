import { randomUUID } from 'node:crypto';

/** Generate a UI identity for a FieldNode. Server- and test-safe. */
export function newNodeId(): string {
  return randomUUID();
}
