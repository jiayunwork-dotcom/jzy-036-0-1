import { describe, expect, it } from 'vitest';
import { SyncController, type SyncEngine } from '../client/src/lib/syncController.js';
import { parseSchemaText } from '../server/src/schema/parser.js';
import { serializeStructure } from '../server/src/schema/serializer.js';
import { sanitizeNode } from '../server/src/schema/sanitize.js';
import { nodeToControl } from '../server/src/schema/controls.js';
import { canonicalEquals } from '../server/src/schema/canonical.js';
import { updateNode } from '../client/src/lib/structureOps.js';
import { SAMPLE_SCHEMA_TEXT } from '../server/src/seed/sampleSchema.js';

/**
 * The core sync guarantee: invalid text never clobbers the visual pane;
 * the tool stays on the last valid state and resyncs when text heals.
 */

// Wire the controller to the real server engine (in-process for tests).
const engine: SyncEngine = {
  parseText: (text) => Promise.resolve(parseSchemaText(text)),
  serializeStructure: (structure) => {
    const root = sanitizeNode(structure);
    return Promise.resolve({ text: serializeStructure(root), controls: nodeToControl(root) });
  },
};

function makeController(): SyncController {
  return new SyncController(engine, () => {}, 0);
}

const OTHER_SCHEMA = '{ "type": "object", "properties": { "x": { "type": "integer" } } }';

describe('文本区非法时的最近合法态保持与恢复', () => {
  it('合法文本 → 结构同步；非法文本 → 结构停留且不被清空；恢复合法 → 重新同步', async () => {
    const ctrl = makeController();
    await ctrl.loadFromText(SAMPLE_SCHEMA_TEXT);
    const goodStructure = ctrl.state.structure!;
    expect(goodStructure.children.length).toBeGreaterThan(0);
    expect(ctrl.state.textError).toBeNull();

    // 键入非法 JSON：结构必须保持最近合法态。
    ctrl.editText('{ "type": "object", "properties": {');
    await ctrl.settled();
    expect(ctrl.state.textError).toBeTruthy();
    expect(ctrl.state.textError).toContain('JSON 语法错误');
    expect(ctrl.state.structure).toBe(goodStructure); // 同一引用，未被清空
    expect(ctrl.state.controls).not.toBeNull();
    expect(ctrl.state.lastValidText).toContain('活动报名表');

    // 继续键入：合法 JSON 但非法 Schema，同样保持。
    ctrl.editText('{ "type": "whatever" }');
    await ctrl.settled();
    expect(ctrl.state.textError).toContain('不支持的 type');
    expect(ctrl.state.structure).toBe(goodStructure);

    // 修复为合法 Schema：两侧重新接上。
    ctrl.editText(OTHER_SCHEMA);
    await ctrl.settled();
    expect(ctrl.state.textError).toBeNull();
    expect(ctrl.state.structure).not.toBe(goodStructure);
    expect(ctrl.state.structure?.children[0]?.name).toBe('x');
    expect(ctrl.state.lastValidText).toContain('"x"');
  });

  it('非法期间可视化区仍可编辑，编辑后文本被重建并清除错误态', async () => {
    const ctrl = makeController();
    await ctrl.loadFromText(SAMPLE_SCHEMA_TEXT);
    const goodStructure = ctrl.state.structure!;

    ctrl.editText('{ broken');
    await ctrl.settled();
    expect(ctrl.state.textError).toBeTruthy();

    // 在最近合法结构上继续编辑：把根的第一个字段改名。
    const edited = updateNode(goodStructure, goodStructure.children[0]!.id, (n) => {
      n.title = '改过的标题';
    });
    ctrl.editStructure(edited);
    await ctrl.settled();

    expect(ctrl.state.textError).toBeNull();
    expect(ctrl.state.text).toContain('改过的标题');
    expect(ctrl.state.structure?.children[0]?.title).toBe('改过的标题');
  });

  it('结构编辑 → 文本更新 → 再解析回结构，语义不变（客户端视角的往返）', async () => {
    const ctrl = makeController();
    await ctrl.loadFromText(SAMPLE_SCHEMA_TEXT);
    const before = ctrl.state.structure!;

    const edited = updateNode(before, before.children[2]!.id, (n) => {
      n.constraints = { ...n.constraints, minimum: 21 };
    });
    ctrl.editStructure(edited);
    await ctrl.settled();

    // 文本区已同步为新 Schema。
    expect(ctrl.state.text).toContain('"minimum": 21');
    // 文本再解析回来与当前结构语义一致。
    const reparsed = parseSchemaText(ctrl.state.text);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(canonicalEquals(reparsed.structure, ctrl.state.structure!)).toBe(true);
  });

  it('快速的连续文本编辑只有最后一次生效（过期响应不落盘）', async () => {
    // 慢速引擎：第一次解析被人为延迟，验证旧响应不会覆盖新状态。
    let releaseFirst!: () => void;
    const gate = new Promise<void>((resolve) => (releaseFirst = resolve));
    let calls = 0;
    const slowEngine: SyncEngine = {
      ...engine,
      parseText: async (text) => {
        calls += 1;
        if (calls === 1) await gate;
        return parseSchemaText(text);
      },
    };
    const ctrl = new SyncController(slowEngine, () => {}, 0);

    ctrl.editText(OTHER_SCHEMA); // 这次响应会被延迟
    ctrl.editText(SAMPLE_SCHEMA_TEXT); // 这次立即完成
    releaseFirst();
    await ctrl.settled();

    expect(ctrl.state.textError).toBeNull();
    expect(ctrl.state.structure?.title).toBe('活动报名表');
    expect(ctrl.state.text).toBe(SAMPLE_SCHEMA_TEXT);
  });
});
