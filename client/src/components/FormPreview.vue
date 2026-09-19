<script setup lang="ts">
import { computed, provide, ref, watch } from 'vue';
import type { ControlNode, FieldNode } from '../../../shared/types';
import { api } from '../api/client';
import { buildInitialData, mergeData } from '../lib/formModel';
import FormField from './FormField.vue';
import { FORM_OPS_KEY } from './formOps';

const props = defineProps<{
  controls: ControlNode | null;
  structure: FieldNode | null;
}>();

const data = ref<Record<string, unknown>>({});
const errors = ref<Record<string, string>>({});
const submitted = ref(false);
const valid = ref(false);
const validating = ref(false);

// Non-object roots are wrapped so the form always has an object shape.
const effectiveControls = computed<ControlNode | null>(() => {
  const c = props.controls;
  if (!c) return null;
  if (c.control === 'object') return c;
  return {
    id: `${c.id}-wrap`,
    name: '',
    control: 'object',
    required: false,
    constraints: {},
    children: [{ ...c, name: 'value' }],
  };
});

watch(
  () => props.controls,
  () => {
    const root = effectiveControls.value;
    data.value = root ? mergeData(root, data.value) : {};
    errors.value = {};
    submitted.value = false;
  },
  { immediate: true },
);

provide(FORM_OPS_KEY, {
  clearError(path: string) {
    if (errors.value[path]) {
      const next = { ...errors.value };
      delete next[path];
      errors.value = next;
    }
  },
});

async function submit(): Promise<void> {
  if (!props.structure) return;
  validating.value = true;
  submitted.value = false;
  try {
    const root = effectiveControls.value;
    const payload = root && props.controls?.control !== 'object'
      ? (data.value as Record<string, unknown>).value
      : data.value;
    const { errors: list } = await api.validateData(props.structure, payload);
    const map: Record<string, string> = {};
    for (const e of list) {
      const key = props.controls?.control !== 'object' && e.path === '' ? 'value' : e.path;
      if (!map[key]) map[key] = e.message;
    }
    errors.value = map;
    valid.value = list.length === 0;
    submitted.value = true;
  } finally {
    validating.value = false;
  }
}

function reset(): void {
  const root = effectiveControls.value;
  data.value = root ? buildInitialData(root) : {};
  errors.value = {};
  submitted.value = false;
}
</script>

<template>
  <div class="form-preview pane">
    <div class="pane-header">表单预览</div>
    <div v-if="effectiveControls" class="pane-body">
      <form @submit.prevent="submit">
        <FormField
          v-for="child in effectiveControls.children ?? []"
          :key="child.id"
          :node="child"
          :path="child.name"
          :root-data="data"
          :errors="errors"
        />
        <div class="preview-actions">
          <button type="submit" class="primary" :disabled="validating">
            {{ validating ? '校验中…' : '校验提交' }}
          </button>
          <button type="button" @click="reset">重置</button>
        </div>
        <div v-if="submitted && valid" class="submit-result ok">
          ✓ 校验通过，输入符合全部约束
        </div>
        <div v-else-if="submitted && !valid" class="submit-result bad">
          ✕ 存在 {{ Object.keys(errors).length }} 处违反约束的输入，已定位到对应字段
        </div>
      </form>
    </div>
    <div v-else class="pane-body empty">Schema 合法后即可预览表单</div>
  </div>
</template>
