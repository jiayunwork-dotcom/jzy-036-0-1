import { describe, expect, it } from 'vitest';
import { DocumentStore } from '../server/src/store/documents.js';

/**
 * Persistence: versioned saves, rollback, per-document isolation and
 * concurrent edits to different documents.
 */

function makeStore(): DocumentStore {
  return new DocumentStore(':memory:');
}

const DOC_A_V1 = '{ "type": "object", "properties": { "a": { "type": "string" } } }';
const DOC_A_V2 = '{ "type": "object", "properties": { "a": { "type": "string" }, "b": { "type": "integer" } } }';
const DOC_A_V3 = '{ "type": "string" }';
const DOC_B_V1 = '{ "type": "object", "properties": { "x": { "type": "boolean" } } }';

describe('文档与版本持久化', () => {
  it('新建文档即拥有初始版本', () => {
    const store = makeStore();
    const doc = store.create('文档A', DOC_A_V1);
    expect(doc.id).toBeTruthy();
    expect(store.get(doc.id)?.content).toBe(DOC_A_V1);
    const versions = store.listVersions(doc.id);
    expect(versions.map((v) => v.versionNo)).toEqual([1]);
  });

  it('每次内容保存追加版本，改名不产生新版本', () => {
    const store = makeStore();
    const doc = store.create('文档A', DOC_A_V1);
    store.update(doc.id, { content: DOC_A_V2 });
    store.update(doc.id, { name: '文档A-改名' });
    store.update(doc.id, { content: DOC_A_V3 });

    const versions = store.listVersions(doc.id);
    expect(versions.map((v) => v.versionNo)).toEqual([3, 2, 1]);
    expect(store.get(doc.id)?.name).toBe('文档A-改名');
    expect(store.get(doc.id)?.content).toBe(DOC_A_V3);
  });

  it('内容未变化时不产生新版本', () => {
    const store = makeStore();
    const doc = store.create('文档A', DOC_A_V1);
    store.update(doc.id, { content: DOC_A_V1 });
    expect(store.listVersions(doc.id)).toHaveLength(1);
  });

  it('可查看历史版本内容', () => {
    const store = makeStore();
    const doc = store.create('文档A', DOC_A_V1);
    store.update(doc.id, { content: DOC_A_V2 });
    expect(store.getVersion(doc.id, 1)?.content).toBe(DOC_A_V1);
    expect(store.getVersion(doc.id, 2)?.content).toBe(DOC_A_V2);
    expect(store.getVersion(doc.id, 99)).toBeNull();
  });

  it('回滚后文档内容与所选版本一致，且回滚本身留痕', () => {
    const store = makeStore();
    const doc = store.create('文档A', DOC_A_V1);
    store.update(doc.id, { content: DOC_A_V2 });
    store.update(doc.id, { content: DOC_A_V3 });

    const restored = store.rollback(doc.id, 1);
    expect(restored?.content).toBe(DOC_A_V1);
    expect(store.get(doc.id)?.content).toBe(DOC_A_V1);

    // 回滚生成新版本，历史不被改写。
    const versions = store.listVersions(doc.id);
    expect(versions.map((v) => v.versionNo)).toEqual([4, 3, 2, 1]);
    expect(store.getVersion(doc.id, 4)?.content).toBe(DOC_A_V1);
    expect(store.getVersion(doc.id, 3)?.content).toBe(DOC_A_V3);
  });

  it('删除文档后版本历史一并清除', () => {
    const store = makeStore();
    const doc = store.create('文档A', DOC_A_V1);
    store.update(doc.id, { content: DOC_A_V2 });
    expect(store.remove(doc.id)).toBe(true);
    expect(store.get(doc.id)).toBeNull();
    expect(store.listVersions(doc.id)).toEqual([]);
  });
});

describe('落盘持久化', () => {
  it('数据写入磁盘文件，重新打开存储后文档与版本完整恢复', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'schema-store-'));
    const file = join(dir, 'store.json');
    try {
      const first = new DocumentStore(file);
      const doc = first.create('持久化文档', DOC_A_V1);
      first.update(doc.id, { content: DOC_A_V2 });

      // 模拟进程重启：用同一文件构造新存储。
      const second = new DocumentStore(file);
      expect(second.get(doc.id)?.content).toBe(DOC_A_V2);
      expect(second.listVersions(doc.id).map((v) => v.versionNo)).toEqual([2, 1]);
      expect(second.getVersion(doc.id, 1)?.content).toBe(DOC_A_V1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('多文档独立与并发', () => {  it('多个文档内容互不影响', () => {
    const store = makeStore();
    const a = store.create('文档A', DOC_A_V1);
    const b = store.create('文档B', DOC_B_V1);

    store.update(a.id, { content: DOC_A_V2 });
    store.update(b.id, { content: '{ "type": "integer" }' });
    store.update(a.id, { content: DOC_A_V3 });

    expect(store.get(a.id)?.content).toBe(DOC_A_V3);
    expect(store.get(b.id)?.content).toBe('{ "type": "integer" }');
    expect(store.listVersions(a.id).map((v) => v.versionNo)).toEqual([3, 2, 1]);
    expect(store.listVersions(b.id).map((v) => v.versionNo)).toEqual([2, 1]);
  });

  it('并发写不同文档不串号、不覆盖', async () => {
    const store = makeStore();
    const docs = await Promise.all(
      Array.from({ length: 5 }, (_, i) => store.create(`并发文档${i}`, `{ "n": ${i} }`)),
    );

    // 模拟并发：对所有文档同时发起多轮保存。
    await Promise.all(
      docs.flatMap((doc, i) =>
        [1, 2, 3].map((round) =>
          Promise.resolve().then(() =>
            store.update(doc.id, { content: `{ "doc": ${i}, "round": ${round} }` }),
          ),
        ),
      ),
    );

    for (const [i, doc] of docs.entries()) {
      const fresh = store.get(doc.id);
      expect(fresh?.content).toBe(`{ "doc": ${i}, "round": 3 }`);
      expect(fresh?.name).toBe(`并发文档${i}`);
      // 初始版本 + 3 次保存，版本号连续无跳号。
      expect(store.listVersions(doc.id).map((v) => v.versionNo)).toEqual([4, 3, 2, 1]);
    }
  });

  it('同一文档的连续保存版本号单调递增', () => {
    const store = makeStore();
    const doc = store.create('文档A', DOC_A_V1);
    for (let i = 0; i < 10; i++) {
      store.update(doc.id, { content: `{ "v": ${i} }` });
    }
    const versions = store.listVersions(doc.id);
    expect(versions.map((v) => v.versionNo)).toEqual(
      [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
    );
  });
});
