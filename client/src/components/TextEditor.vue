<script setup lang="ts">
defineProps<{ text: string; error: string | null }>();
const emit = defineEmits<{ (e: 'edit', text: string): void }>();

function onInput(e: Event): void {
  emit('edit', (e.target as HTMLTextAreaElement).value);
}
</script>

<template>
  <div class="text-editor pane">
    <div class="pane-header">
      Schema 文本
      <span v-if="error" class="badge bad">非法</span>
      <span v-else-if="text" class="badge ok">合法</span>
    </div>
    <textarea
      class="schema-text"
      :class="{ invalid: error }"
      :value="text"
      spellcheck="false"
      @input="onInput"
    ></textarea>
    <div v-if="error" class="text-error" role="alert">
      <strong>当前文本非法，可视化区已停留在最近一次合法状态：</strong>
      <code>{{ error }}</code>
    </div>
  </div>
</template>
