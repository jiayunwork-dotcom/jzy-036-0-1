import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/src/app.js';
import { SAMPLE_SCHEMA_TEXT } from '../server/src/seed/sampleSchema.js';

/** End-to-end HTTP API: transform engine + documents + versions + rollback. */

function app() {
  return createApp(':memory:', { seed: false }).app;
}

describe('变换引擎 API', () => {
  it('POST /api/schema/parse 合法文本返回结构与控件树', async () => {
    const res = await request(app())
      .post('/api/schema/parse')
      .send({ text: '{ "type": "string", "enum": ["a", "b"] }' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.controls.control).toBe('select');
    expect(res.body.canonicalText).toContain('"enum"');
  });

  it('POST /api/schema/parse 非法文本返回 ok:false 与原因（HTTP 仍 200）', async () => {
    const res = await request(app()).post('/api/schema/parse').send({ text: '{ nope' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toContain('JSON 语法错误');
  });

  it('POST /api/schema/serialize 结构转文本', async () => {
    const structure = {
      id: '1',
      name: '',
      type: 'object',
      required: false,
      constraints: {},
      children: [
        {
          id: '2',
          name: 'age',
          type: 'integer',
          required: true,
          constraints: { minimum: 0 },
          children: [],
        },
      ],
    };
    const res = await request(app()).post('/api/schema/serialize').send({ structure });
    expect(res.status).toBe(200);
    const schema = JSON.parse(res.body.text);
    expect(schema).toEqual({
      type: 'object',
      properties: { age: { type: 'integer', minimum: 0 } },
      required: ['age'],
    });
    expect(res.body.controls.children[0].control).toBe('number');
  });

  it('POST /api/schema/validate-data 拦截违规、放行合法', async () => {
    const structure = {
      id: '1',
      name: '',
      type: 'object',
      required: false,
      constraints: {},
      children: [
        { id: '2', name: 'name', type: 'string', required: true, constraints: { minLength: 2 }, children: [] },
      ],
    };
    const bad = await request(app())
      .post('/api/schema/validate-data')
      .send({ structure, data: { name: '张' } });
    expect(bad.body.errors).toHaveLength(1);
    expect(bad.body.errors[0].path).toBe('name');

    const good = await request(app())
      .post('/api/schema/validate-data')
      .send({ structure, data: { name: '张三' } });
    expect(good.body.errors).toEqual([]);
  });
});

describe('文档与版本 API', () => {
  it('文档全生命周期：新建 → 保存留版本 → 查看版本 → 回滚', async () => {
    const a = app();

    const created = await request(a).post('/api/documents').send({ name: '测试文档', content: '{ "v": 1 }' });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    await request(a).put(`/api/documents/${id}`).send({ content: '{ "v": 2 }' });
    await request(a).put(`/api/documents/${id}`).send({ content: '{ "v": 3 }' });

    const versions = await request(a).get(`/api/documents/${id}/versions`);
    expect(versions.body.map((v: { versionNo: number }) => v.versionNo)).toEqual([3, 2, 1]);

    const v1 = await request(a).get(`/api/documents/${id}/versions/1`);
    expect(v1.body.content).toBe('{ "v": 1 }');

    const rolled = await request(a).post(`/api/documents/${id}/rollback`).send({ versionNo: 1 });
    expect(rolled.status).toBe(200);
    expect(rolled.body.content).toBe('{ "v": 1 }');

    const after = await request(a).get(`/api/documents/${id}`);
    expect(after.body.content).toBe('{ "v": 1 }');
    const versionsAfter = await request(a).get(`/api/documents/${id}/versions`);
    expect(versionsAfter.body).toHaveLength(4);
  });

  it('并发编辑不同文档互不覆盖', async () => {
    const a = app();
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(a).post('/api/documents').send({ name: `并发${i}` });
      ids.push(res.body.id);
    }
    await Promise.all(
      ids.map((id, i) =>
        request(a)
          .put(`/api/documents/${id}`)
          .send({ content: `{ "owner": ${i} }` }),
      ),
    );
    for (const [i, id] of ids.entries()) {
      const res = await request(a).get(`/api/documents/${id}`);
      expect(res.body.content).toBe(`{ "owner": ${i} }`);
    }
  });

  it('缺失资源返回 404，错误请求返回 400', async () => {
    const a = app();
    expect((await request(a).get('/api/documents/nope')).status).toBe(404);
    expect((await request(a).post('/api/documents').send({})).status).toBe(400);
    expect((await request(a).post('/api/schema/parse').send({})).status).toBe(400);
    expect(
      (await request(a).post('/api/documents/x/rollback').send({ versionNo: 1 })).status,
    ).toBe(404);
  });
});

describe('种子数据', () => {
  it('空库启动时预置示范 Schema，且内容合法可解析', async () => {
    const a = createApp(':memory:').app;
    const list = await request(a).get('/api/documents');
    expect(list.body).toHaveLength(1);
    expect(list.body[0].name).toContain('示例');

    const doc = await request(a).get(`/api/documents/${list.body[0].id}`);
    expect(doc.body.content).toBe(SAMPLE_SCHEMA_TEXT);
    const parsed = await request(a).post('/api/schema/parse').send({ text: doc.body.content });
    expect(parsed.body.ok).toBe(true);
  });
});
