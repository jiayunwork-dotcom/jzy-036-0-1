import type { InjectionKey } from 'vue';

/** Preview-form operations provided to recursive field components. */
export interface FormOps {
  clearError(path: string): void;
}

export const FORM_OPS_KEY: InjectionKey<FormOps> = Symbol('form-ops');
