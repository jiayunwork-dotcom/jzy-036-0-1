<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import type { DocumentSummary, SchemaDocument } from '../../shared/types';
import { api } from './api/client';
import { SyncController, type SyncState } from './lib/syncController';
import StructureEditor from './components/StructureEditor.vue';
import TextEditor from './components/TextEditor.vue';
import FormPreview from './components/FormPreview.vue';
import DocumentSidebar from './components/DocumentSidebar.vue';

// ---- sync controller: single source of truth for the two-pane sync ----
const syncState = reactive<SyncState>({
  structure: null,
  controls: null,
  text: '',
  lastValidText: '',
  textError: null,
});
const sync = new SyncController(api, (s) => Object.assign(syncState, s), 300);

// ---- documents ----
const documents = ref<DocumentSummary[]>([]);
const current = ref<SchemaDocument | null>(null);
const sidebar = ref<InstanceType<typeof DocumentSidebar> | null>(null);
const saving = ref(false);
const toast = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

let toastTimer: ReturnType<typeof setTimeout> | null = null;
function showToast(msg: string): void {
  toast.value = msg;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = null), 3000);
}

async function refreshDocuments(): Promise<void> {
  documents.value = await api.listDocuments();
}

async function loadDocument(id: string): Promise<void> {
  current.value = await api.getDocument(id);
  await sync.loadFromText(current.value.content);
}

async function selectDocument(id: string): Promise<void> {
  if (current.value?.id === id) return;
  await loadDocument(id);
}

async function createDocument(name: string): Promise<void> {
  const doc = await api.createDocument(name);
  await refreshDocuments();
  await loadDocument(doc.id);
  showToast(`已创建「${name}」`);
}

async function removeDocument(id: string): Promise<void> {
  await api.deleteDocument(id);
  await refreshDocuments();
  if (current.value?.id === id) {
    const first = documents.value[0];
    if (first) await loadDocument(first.id);
    else current.value = null;
  }
}

async function renameDocument(id: string, name: string): Promise<void> {
  await api.updateDocument(id, { name });
  await refreshDocuments();
  if (current.value?.id === id) current.value = await api.getDocument(id);
}

async function save(): Promise<void> {
  if (!current.value) return;
  if (syncState.textError) {
    showToast('文本当前非法，保存的是最近一次合法内容');
  }
  saving.value = true;
  try {
    current.value = await api.updateDocument(current.value.id, {
      content: syncState.lastValidText,
    });
    await refreshDocuments();
    await sidebar.value?.refreshVersions();
    showToast('已保存（留存新版本）');
  } finally {
    saving.value = false;
  }
}

async function rollback(versionNo: number): Promise<void> {
  if (!current.value) return;
  current.value = await api.rollback(current.value.id, versionNo);
  await sync.loadFromText(current.value.content);
  await refreshDocuments();
  await sidebar.value?.refreshVersions();
  showToast(`已回滚到 v${versionNo}`);
}

// ---- export / import ----
function exportSchema(): void {
  const name = current.value?.name ?? 'schema';
  const blob = new Blob([syncState.lastValidText || syncState.text], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.schema.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function triggerImport(): void {
  fileInput.value?.click();
}

async function onImportFile(e: Event): Promise<void> {
  const file = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = '';
  if (!file) return;
  const text = await file.text();
  await sync.loadFromText(text);
  if (syncState.textError) {
    showToast(`导入失败：${syncState.textError}`);
  } else {
    showToast('已导入，两侧已铺开（记得保存）');
  }
}

onMounted(async () => {
  await refreshDocuments();
  const first = documents.value[0];
  if (first) await loadDocument(first.id);
});
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">Schema Form Studio</div>
      <div v-if="current" class="doc-title">{{ current.name }}</div>
      <div class="top-actions">
        <button class="primary" :disabled="!current || saving" @click="save">
          {{ saving ? '保存中…' : '保存' }}
        </button>
        <button :disabled="!current" @click="exportSchema">导出 Schema</button>
        <button :disabled="!current" @click="triggerImport">导入 Schema</button>
        <input
          ref="fileInput"
          type="file"
          accept=".json,application/json"
          style="display: none"
          @change="onImportFile"
        />
      </div>
    </header>

    <div v-if="syncState.textError" class="global-error" role="alert">
      文本编辑区内容非法：{{ syncState.textError }} —— 可视化区与预览保持在最近一次合法状态。
    </div>

    <div class="main">
      <DocumentSidebar
        ref="sidebar"
        :documents="documents"
        :current-id="current?.id ?? null"
        @select="selectDocument"
        @create="createDocument"
        @remove="removeDocument"
        @rename="renameDocument"
        @rollback="rollback"
      />
      <div class="panes">
        <div class="edit-row">
          <StructureEditor :structure="syncState.structure" @update="sync.editStructure" />
          <TextEditor
            :text="syncState.text"
            :error="syncState.textError"
            @edit="sync.editText"
          />
        </div>
        <FormPreview :controls="syncState.controls" :structure="syncState.structure" />
      </div>
    </div>

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>
