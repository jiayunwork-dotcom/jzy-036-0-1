import type { FieldNode } from '../../../shared/types';
import type { InjectionKey } from 'vue';

/** Operations the structure editor provides to its recursive rows. */
export interface FieldOps {
  apply(id: string, mutate: (node: FieldNode) => void): void;
  remove(id: string): void;
}

export const FIELD_OPS_KEY: InjectionKey<FieldOps> = Symbol('field-ops');
