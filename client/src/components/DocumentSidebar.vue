<script setup lang="ts">
import { ref, watch } from 'vue';
import type { DocumentSummary, SchemaVersion, VersionSummary } from '../../../shared/types';
import { api } from '../api/client';

const props = defineProps<{
  documents: DocumentSummary[];
  currentId: string | null;
}>();

const emit = defineEmits<{
  (e: 'select', id: string): void;
  (e: 'create', name: string): void;
  (e: 'remove', id: string): void;
  (e: 'rename', id: string, name: string): void;
  (e: 'rollback', versionNo: number): void;
}>();

const newName = ref('');
const renamingId = ref<string | null>(null);
const renameText = ref('');
const versions = ref<VersionSummary[]>([]);
const viewing = ref<SchemaVersion | null>(null);

watch(
  () => props.currentId,
  async (id) => {
    versions.value = id ? await api.listVersions(id) : [];
    viewing.value = null;
  },
  { immediate: true },
);

async function refreshVersions(): Promise<void> {
  if (props.currentId) versions.value = await api.listVersions(props.currentId);
}
defineExpose({ refreshVersions });

function create(): void {
  const name = newName.value.trim();
  if (!name) return;
  emit('create', name);
  newName.value = '';
}

function startRename(doc: DocumentSummary): void {
  renamingId.value = doc.id;
  renameText.value = doc.name;
}

function commitRename(): void {
  const name = renameText.value.trim();
  if (renamingId.value && name) emit('rename', renamingId.value, name);
  renamingId.value = null;
}

async function viewVersion(no: number): Promise<void> {
  if (!props.currentId) return;
  viewing.value = await api.getVersion(props.currentId, no);
}

function confirmRemove(id: string): void {
  if (window.confirm('确定删除该文档？其全部版本历史将一并删除。')) emit('remove', id);
}

function confirmRollback(): void {
  if (!viewing.value) return;
  if (window.confirm(`回滚到版本 v${viewing.value.versionNo}？当前内容将被该版本覆盖（会记录为新版本）。`)) {
    emit('rollback', viewing.value.versionNo);
    viewing.value = null;
  }
}
</script>

<template>
  <aside class="sidebar">
    <div class="side-section">
      <div class="side-title">Schema 文档</div>
      <div class="new-doc">
        <input v-model="newName" placeholder="新文档名称" @keyup.enter="create" />
        <button class="primary" @click="create">新建</button>
      </div>
      <ul class="doc-list">
        <li
          v-for="doc in documents"
          :key="doc.id"
          :class="{ active: doc.id === currentId }"
          @click="emit('select', doc.id)"
        >
          <template v-if="renamingId === doc.id">
            <input
              v-model="renameText"
              @keyup.enter="commitRename"
              @blur="commitRename"
              @click.stop
            />
          </template>
          <template v-else>
            <span class="doc-name">{{ doc.name }}</span>
            <span class="doc-actions" @click.stop>
              <button class="icon-btn" title="重命名" @click="startRename(doc)">✎</button>
              <button class="icon-btn danger" title="删除" @click="confirmRemove(doc.id)">✕</button>
            </span>
          </template>
        </li>
      </ul>
    </div>

    <div class="side-section versions">
      <div class="side-title">版本历史</div>
      <ul v-if="versions.length" class="version-list">
        <li v-for="v in versions" :key="v.versionNo">
          <button class="version-link" @click="viewVersion(v.versionNo)">
            v{{ v.versionNo }}
          </button>
          <span class="version-time">{{ new Date(v.createdAt).toLocaleString() }}</span>
        </li>
      </ul>
      <div v-else class="empty">暂无版本</div>
    </div>

    <div v-if="viewing" class="modal-mask" @click.self="viewing = null">
      <div class="modal">
        <div class="modal-header">
          版本 v{{ viewing.versionNo }} · {{ new Date(viewing.createdAt).toLocaleString() }}
          <button class="icon-btn" @click="viewing = null">✕</button>
        </div>
        <pre class="modal-body">{{ viewing.content }}</pre>
        <div class="modal-footer">
          <button class="primary" @click="confirmRollback">回滚到此版本</button>
          <button @click="viewing = null">关闭</button>
        </div>
      </div>
    </div>
  </aside>
</template>
