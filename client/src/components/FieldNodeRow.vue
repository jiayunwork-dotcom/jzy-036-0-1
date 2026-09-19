<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import type { FieldNode, FieldType } from '../../../shared/types';
import {
  changeType,
  createNode,
  enumToLines,
  parseDefaultInput,
  parseEnumLines,
} from '../lib/structureOps';
import { FIELD_OPS_KEY, type FieldOps } from './fieldOps';

const props = defineProps<{
  node: FieldNode;
  isRoot?: boolean;
  isArrayItem?: boolean;
  depth?: number;
}>();

const ops = inject<FieldOps>(FIELD_OPS_KEY)!;
const expanded = ref(true);
const showAdvanced = ref(false);

const TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: 'string', label: '字符串' },
  { value: 'number', label: '数值' },
  { value: 'integer', label: '整数' },
  { value: 'boolean', label: '布尔' },
  { value: 'object', label: '对象' },
  { value: 'array', label: '数组' },
];

const depth = computed(() => props.depth ?? 0);
const isScalar = computed(() => !['object', 'array'].includes(props.node.type));

function apply(mutate: (n: FieldNode) => void): void {
  ops.apply(props.node.id, mutate);
}

function onTypeChange(e: Event): void {
  const type = (e.target as HTMLSelectElement).value as FieldType;
  apply((n) => changeType(n, type));
}

function onNameInput(e: Event): void {
  const name = (e.target as HTMLInputElement).value;
  apply((n) => {
    n.name = name;
  });
}

function onRequiredChange(e: Event): void {
  const required = (e.target as HTMLInputElement).checked;
  apply((n) => {
    n.required = required;
  });
}

function setConstraint(key: keyof FieldNode['constraints'], raw: string): void {
  apply((n) => {
    if (raw === '') {
      delete n.constraints[key];
    } else if (key === 'pattern') {
      n.constraints[key] = raw;
    } else {
      const num = Number(raw);
      if (Number.isFinite(num)) n.constraints[key] = num;
    }
  });
}

function setMeta(key: 'title' | 'description', raw: string): void {
  apply((n) => {
    if (raw === '') delete n[key];
    else n[key] = raw;
  });
}

function toggleDefault(checked: boolean): void {
  apply((n) => {
    n.hasDefault = checked;
    if (checked && n.default === undefined) n.default = null;
  });
}

function onDefaultInput(raw: string): void {
  apply((n) => {
    n.default = parseDefaultInput(raw);
  });
}

function toggleEnum(checked: boolean): void {
  apply((n) => {
    n.hasEnum = checked;
    if (checked && !Array.isArray(n.enum)) n.enum = [];
  });
}

function onEnumInput(raw: string): void {
  apply((n) => {
    n.enum = parseEnumLines(raw);
  });
}

function addChild(): void {
  apply((n) => {
    const child = createNode('string', `field${n.children.length + 1}`);
    n.children.push(child);
  });
}

function defaultText(): string {
  const d = props.node.default;
  if (d === undefined || d === null) return d === null ? 'null' : '';
  return typeof d === 'string' ? d : JSON.stringify(d);
}
</script>

<template>
  <div class="field-node" :style="{ marginLeft: depth ? '18px' : '0' }">
    <div class="field-row">
      <button class="icon-btn" :title="expanded ? '收起' : '展开'" @click="expanded = !expanded">
        {{ expanded ? '▾' : '▸' }}
      </button>

      <input
        v-if="!isRoot && !isArrayItem"
        class="name-input"
        :value="node.name"
        placeholder="字段名"
        @input="onNameInput"
      />
      <span v-else class="root-badge">{{ isRoot ? '根' : '子项' }}</span>

      <select class="type-select" :value="node.type" @change="onTypeChange">
        <option v-for="opt in TYPE_OPTIONS" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>

      <label v-if="!isRoot && !isArrayItem" class="required-flag">
        <input type="checkbox" :checked="node.required" @change="onRequiredChange" />
        必填
      </label>

      <button class="icon-btn" title="高级设置" @click="showAdvanced = !showAdvanced">⚙</button>
      <button
        v-if="!isRoot && !isArrayItem"
        class="icon-btn danger"
        title="删除字段"
        @click="ops.remove(node.id)"
      >
        ✕
      </button>
    </div>

    <div v-if="expanded" class="field-body">
      <div v-if="showAdvanced" class="advanced">
        <label class="adv-row">
          <span>标题</span>
          <input :value="node.title ?? ''" @input="setMeta('title', ($event.target as HTMLInputElement).value)" />
        </label>
        <label class="adv-row">
          <span>描述</span>
          <input :value="node.description ?? ''" @input="setMeta('description', ($event.target as HTMLInputElement).value)" />
        </label>

        <template v-if="node.type === 'string'">
          <label class="adv-row">
            <span>最小长度</span>
            <input type="number" min="0" :value="node.constraints.minLength ?? ''" @input="setConstraint('minLength', ($event.target as HTMLInputElement).value)" />
          </label>
          <label class="adv-row">
            <span>最大长度</span>
            <input type="number" min="0" :value="node.constraints.maxLength ?? ''" @input="setConstraint('maxLength', ($event.target as HTMLInputElement).value)" />
          </label>
          <label class="adv-row">
            <span>正则模式</span>
            <input :value="node.constraints.pattern ?? ''" placeholder="^\\d+$" @input="setConstraint('pattern', ($event.target as HTMLInputElement).value)" />
          </label>
        </template>

        <template v-if="node.type === 'number' || node.type === 'integer'">
          <label class="adv-row">
            <span>最小值</span>
            <input type="number" :value="node.constraints.minimum ?? ''" @input="setConstraint('minimum', ($event.target as HTMLInputElement).value)" />
          </label>
          <label class="adv-row">
            <span>最大值</span>
            <input type="number" :value="node.constraints.maximum ?? ''" @input="setConstraint('maximum', ($event.target as HTMLInputElement).value)" />
          </label>
          <label class="adv-row">
            <span>大于(不含)</span>
            <input type="number" :value="node.constraints.exclusiveMinimum ?? ''" @input="setConstraint('exclusiveMinimum', ($event.target as HTMLInputElement).value)" />
          </label>
          <label class="adv-row">
            <span>小于(不含)</span>
            <input type="number" :value="node.constraints.exclusiveMaximum ?? ''" @input="setConstraint('exclusiveMaximum', ($event.target as HTMLInputElement).value)" />
          </label>
        </template>

        <template v-if="node.type === 'array'">
          <label class="adv-row">
            <span>最少项数</span>
            <input type="number" min="0" :value="node.constraints.minItems ?? ''" @input="setConstraint('minItems', ($event.target as HTMLInputElement).value)" />
          </label>
          <label class="adv-row">
            <span>最多项数</span>
            <input type="number" min="0" :value="node.constraints.maxItems ?? ''" @input="setConstraint('maxItems', ($event.target as HTMLInputElement).value)" />
          </label>
        </template>

        <template v-if="isScalar">
          <label class="adv-row checkbox-row">
            <input type="checkbox" :checked="node.hasEnum === true" @change="toggleEnum(($event.target as HTMLInputElement).checked)" />
            <span>枚举取值（下拉）</span>
          </label>
          <label v-if="node.hasEnum" class="adv-row">
            <span>枚举值<br /><small>每行一个</small></span>
            <textarea
              rows="3"
              :value="enumToLines(node.enum ?? [])"
              @input="onEnumInput(($event.target as HTMLTextAreaElement).value)"
            ></textarea>
          </label>

          <label class="adv-row checkbox-row">
            <input type="checkbox" :checked="node.hasDefault === true" @change="toggleDefault(($event.target as HTMLInputElement).checked)" />
            <span>默认值</span>
          </label>
          <label v-if="node.hasDefault" class="adv-row">
            <span>默认值<br /><small>JSON 或文本</small></span>
            <input :value="defaultText()" @input="onDefaultInput(($event.target as HTMLInputElement).value)" />
          </label>
        </template>
      </div>

      <div v-if="node.type === 'object'" class="children">
        <FieldNodeRow
          v-for="child in node.children"
          :key="child.id"
          :node="child"
          :depth="depth + 1"
        />
        <button class="add-btn" @click="addChild">+ 添加字段</button>
      </div>

      <div v-if="node.type === 'array' && node.items" class="children">
        <div class="items-label">子项结构：</div>
        <FieldNodeRow :node="node.items" :is-array-item="true" :depth="depth + 1" />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
export default { name: 'FieldNodeRow' };
</script>
