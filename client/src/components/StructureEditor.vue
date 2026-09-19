<script setup lang="ts">
import { provide } from 'vue';
import type { FieldNode } from '../../../shared/types';
import { removeNode, updateNode } from '../lib/structureOps';
import FieldNodeRow from './FieldNodeRow.vue';
import { FIELD_OPS_KEY, type FieldOps } from './fieldOps';

const props = defineProps<{ structure: FieldNode | null }>();
const emit = defineEmits<{ (e: 'update', root: FieldNode): void }>();

const ops: FieldOps = {
  apply(id, mutate) {
    if (!props.structure) return;
    emit('update', updateNode(props.structure, id, mutate));
  },
  remove(id) {
    if (!props.structure) return;
    emit('update', removeNode(props.structure, id));
  },
};
provide(FIELD_OPS_KEY, ops);
</script>

<template>
  <div class="structure-editor pane">
    <div class="pane-header">可视化结构</div>
    <div v-if="structure" class="pane-body">
      <FieldNodeRow :node="structure" :is-root="true" />
    </div>
    <div v-else class="pane-body empty">暂无可用结构</div>
  </div>
</template>
