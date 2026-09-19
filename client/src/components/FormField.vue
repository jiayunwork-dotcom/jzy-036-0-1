<script setup lang="ts">
import { computed, inject } from 'vue';
import type { ControlNode } from '../../../shared/types';
import { emptyItem, getPath, setPath } from '../lib/formModel';
import { FORM_OPS_KEY, type FormOps } from './formOps';

const props = defineProps<{
  node: ControlNode;
  path: string;
  rootData: Record<string, unknown>;
  errors: Record<string, string>;
}>();

const ops = inject<FormOps>(FORM_OPS_KEY, { clearError: () => {} });

const value = computed(() => getPath(props.rootData, props.path));
const error = computed(() => props.errors[props.path]);

const label = computed(() => props.node.title || props.node.name || '值');

function update(v: unknown): void {
  setPath(props.rootData, props.path, v);
  ops.clearError(props.path);
}

function onText(e: Event): void {
  update((e.target as HTMLInputElement).value);
}

function onNumber(e: Event): void {
  const raw = (e.target as HTMLInputElement).value;
  update(raw === '' ? null : Number(raw));
}

function onCheckbox(e: Event): void {
  update((e.target as HTMLInputElement).checked);
}

function onSelect(e: Event): void {
  const raw = (e.target as HTMLSelectElement).value;
  if (raw === '') {
    update(null);
    return;
  }
  const option = (props.node.options ?? [])[Number(raw)];
  update(option);
}

function selectedIndex(): number {
  const v = value.value;
  const idx = (props.node.options ?? []).findIndex(
    (o) => JSON.stringify(o) === JSON.stringify(v),
  );
  return idx;
}

function optionLabel(o: unknown): string {
  return typeof o === 'string' ? o : JSON.stringify(o);
}

function childPath(name: string): string {
  return props.path ? `${props.path}.${name}` : name;
}

const arrayValue = computed<unknown[]>(() =>
  Array.isArray(value.value) ? (value.value as unknown[]) : [],
);

const canAdd = computed(
  () =>
    props.node.constraints.maxItems === undefined ||
    arrayValue.value.length < props.node.constraints.maxItems,
);

function addItem(): void {
  if (!props.node.item || !canAdd.value) return;
  update([...arrayValue.value, emptyItem(props.node.item)]);
}

function removeItem(index: number): void {
  update(arrayValue.value.filter((_, i) => i !== index));
}

function hint(): string {
  const c = props.node.constraints;
  const parts: string[] = [];
  if (c.minLength !== undefined) parts.push(`长度≥${c.minLength}`);
  if (c.maxLength !== undefined) parts.push(`长度≤${c.maxLength}`);
  if (c.pattern) parts.push(`模式 ${c.pattern}`);
  if (c.minimum !== undefined) parts.push(`≥${c.minimum}`);
  if (c.maximum !== undefined) parts.push(`≤${c.maximum}`);
  if (c.exclusiveMinimum !== undefined) parts.push(`>${c.exclusiveMinimum}`);
  if (c.exclusiveMaximum !== undefined) parts.push(`<${c.exclusiveMaximum}`);
  if (c.minItems !== undefined) parts.push(`至少${c.minItems}项`);
  if (c.maxItems !== undefined) parts.push(`至多${c.maxItems}项`);
  return parts.join('，');
}
</script>

<template>
  <div class="form-field" :class="{ 'has-error': error }">
    <!-- scalar: text -->
    <template v-if="node.control === 'text'">
      <label class="ff-label">
        {{ label }}<span v-if="node.required" class="req">*</span>
      </label>
      <input
        class="ff-input"
        type="text"
        :value="(value as string) ?? ''"
        @input="onText"
      />
    </template>

    <!-- scalar: number -->
    <template v-else-if="node.control === 'number'">
      <label class="ff-label">
        {{ label }}<span v-if="node.required" class="req">*</span>
      </label>
      <input
        class="ff-input"
        type="number"
        :value="value === null || value === undefined ? '' : (value as number)"
        @input="onNumber"
      />
    </template>

    <!-- scalar: checkbox -->
    <template v-else-if="node.control === 'checkbox'">
      <label class="ff-label checkbox">
        <input type="checkbox" :checked="value === true" @change="onCheckbox" />
        {{ label }}<span v-if="node.required" class="req">*</span>
      </label>
    </template>

    <!-- scalar: select -->
    <template v-else-if="node.control === 'select'">
      <label class="ff-label">
        {{ label }}<span v-if="node.required" class="req">*</span>
      </label>
      <select class="ff-input" :value="selectedIndex() === -1 ? '' : String(selectedIndex())" @change="onSelect">
        <option value="">（请选择）</option>
        <option v-for="(opt, i) in node.options ?? []" :key="i" :value="String(i)">
          {{ optionLabel(opt) }}
        </option>
      </select>
    </template>

    <!-- object group -->
    <fieldset v-else-if="node.control === 'object'" class="ff-object">
      <legend>{{ label }}<span v-if="node.required" class="req">*</span></legend>
      <FormField
        v-for="child in node.children ?? []"
        :key="child.id"
        :node="child"
        :path="childPath(child.name)"
        :root-data="rootData"
        :errors="errors"
      />
    </fieldset>

    <!-- array: repeatable items -->
    <fieldset v-else-if="node.control === 'array'" class="ff-array">
      <legend>{{ label }}<span v-if="node.required" class="req">*</span></legend>
      <div v-for="(_, i) in arrayValue" :key="i" class="ff-array-item">
        <FormField
          v-if="node.item"
          :node="node.item"
          :path="`${path}.${i}`"
          :root-data="rootData"
          :errors="errors"
        />
        <button type="button" class="icon-btn danger" title="删除此项" @click="removeItem(i)">✕</button>
      </div>
      <button type="button" class="add-btn" :disabled="!canAdd" @click="addItem">
        + 添加一项
      </button>
    </fieldset>

    <div v-if="node.description" class="ff-desc">{{ node.description }}</div>
    <div v-if="hint()" class="ff-hint">{{ hint() }}</div>
    <div v-if="error" class="ff-error">{{ error }}</div>
  </div>
</template>

<script lang="ts">
export default { name: 'FormField' };
</script>
