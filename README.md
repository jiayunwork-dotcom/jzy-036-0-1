# Schema Form Studio

浏览器里的 JSON Schema 可视化表单生成器：**可视化结构编辑区** 与 **Schema 文本编辑区** 表达同一份 Schema，任何一侧的改动实时同步到另一侧，并据此即时渲染可填写、可校验的 **表单预览**。Schema 文档作为一等实体持久化，带版本轨迹与回滚。

## 快速开始

### Docker（一键）

```bash
docker compose up --build
# 打开 http://localhost:8080
```

### 本地开发

```bash
npm install
npm run dev        # 后端 :8080 + 前端热更新 :5173（/api 代理到 8080）
```

### 本地生产模式

```bash
npm install
npm run build      # 构建前端到 client/dist
npm start          # 后端 :8080 同时托管 API 与前端静态资源
```

### 测试与检查

```bash
npm test           # 58 个自动化测试（vitest）
npm run typecheck  # server + client 严格类型检查
```

首次启动自动预置「示例：活动报名表」文档（嵌套对象、数组、枚举、正则/长度/数值约束），载入后三窗格立即可交互。

## 界面与交互

- **左栏**：文档列表（新建/重命名/删除）+ 版本历史（查看任意版本、回滚）。
- **可视化结构区**：字段树编辑 —— 增删字段、改字段名/类型/必填、嵌套对象与子数组、数组子项结构；每个字段的 ⚙ 高级面板可设标题、描述、默认值、枚举取值与类型约束（长度、正则、数值界、项数）。
- **Schema 文本区**：同一份 Schema 的文本形态，可直接粘贴/编辑；非法时顶部与编辑器下方给出原因。
- **表单预览**：按控件映射渲染的可填写表单，「校验提交」把数据交给后端校验，违规输入被拦下并把错误定位到字段。
- **顶栏**：保存（留存新版本）、导出 Schema（下载 `.schema.json`）、导入 Schema（外部文件反向铺开两侧）。

## 双向同步语义（最近合法态纪律）

同步由前端 `SyncController` 与后端变换引擎共同保证：

1. **文本 → 结构**：文本编辑经防抖后交由后端解析。解析成功 → 结构区与预览更新；**解析失败 → 只记录错误原因，结构区与预览停留在最近一次合法状态，且仍可继续编辑**。
2. **结构 → 文本**：结构区任何改动由后端序列化为规范文本，替换文本区内容并清除错误态（包括非法期间的编辑，文本会被重建为合法内容）。
3. **恢复**：文本重新变为合法 JSON Schema 时，两侧自动重新接上。
4. **竞态**：所有异步结果携带单调序号，过期响应一律丢弃，慢响应永远不会覆盖更新的编辑。

## 支持的 Schema 子集与控件映射

| Schema | 控件 |
| --- | --- |
| `string` | 文本框 |
| `number` / `integer` | 数字输入 |
| `boolean` | 勾选框 |
| 带 `enum` 的任意标量 | 下拉选择 |
| `object` + `properties`/`required` | 分组嵌套字段 |
| `array` + `items` | 可增删重复项 |

约束：`required`、`minLength`/`maxLength`、`pattern`、`minimum`/`maximum`、`exclusiveMinimum`/`exclusiveMaximum`、`minItems`/`maxItems`、`enum`、`default`，在预览校验中全部真正生效。未知关键字（如 `$schema`、`format`）导入时被忽略；`items` 的元组形式会被明确拒绝。

## HTTP API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/schema/parse` | `{text}` → `{ok, structure, controls, canonicalText}` 或 `{ok:false, error}` |
| POST | `/api/schema/serialize` | `{structure}` → `{text, controls}` |
| POST | `/api/schema/validate-data` | `{structure, data}` → `{errors: [{path, message}]}` |
| GET/POST | `/api/documents` | 列表 / 新建 `{name, content?}` |
| GET/PUT/DELETE | `/api/documents/:id` | 读取 / 保存（内容变更自动留版本）/ 删除 |
| GET | `/api/documents/:id/versions` | 版本列表（新→旧） |
| GET | `/api/documents/:id/versions/:no` | 某版本完整内容 |
| POST | `/api/documents/:id/rollback` | `{versionNo}` 回滚（记录为新版本） |

## 代码结构

```
shared/types.ts              前后端共享类型（FieldNode / ControlNode / ...）
server/src/
  schema/parser.ts           文本 → 结构（严格校验，错误带路径与行列）
  schema/serializer.ts       结构 → Schema 文本（固定键序，规范化输出）
  schema/sanitize.ts         客户端结构负载的宽容归一化
  schema/controls.ts         结构 → 控件树映射
  schema/validate.ts         表单数据约束校验（错误定位到字段路径）
  schema/canonical.ts        语义指纹（去 UI id 的等价判定）
  routes/schema.ts           变换引擎 HTTP 路由
  routes/documents.ts        文档/版本 HTTP 路由
  store/fileDb.ts            原子写 JSON 文件存储引擎
  store/documents.ts         文档 + 版本仓库（同事务留痕）
  seed/sampleSchema.ts       预置示范 Schema
  app.ts / index.ts          应用装配 / 入口
client/src/
  lib/syncController.ts      双向同步控制器（最近合法态 + 竞态守卫）
  lib/structureOps.ts        结构树纯函数操作
  lib/formModel.ts           表单数据模型（路径读写/默认值/合并）
  api/client.ts              后端 API 封装
  components/
    StructureEditor.vue      可视化结构编辑区
    FieldNodeRow.vue         递归字段行（类型/约束/嵌套）
    TextEditor.vue           Schema 文本编辑区（非法提示）
    FormPreview.vue          表单预览（提交校验）
    FormField.vue            递归控件渲染
    DocumentSidebar.vue      文档列表 + 版本历史/回滚
tests/                       vitest：往返不变量、非法回退、约束校验、
                             导入导出、版本回滚、并发隔离、HTTP API
```

## 持久化

文档与版本存储在单个 JSON 文件中（默认 `server/data/store.json`，可用 `DB_PATH` 覆盖；Docker 中挂在 `/app/data` 卷）。每次变更以「写临时文件 + 原子改名」落盘，进程内同步写天然串行化并发请求。每次内容保存都会在同一原子写里追加不可变版本，回滚把旧版本复制为新版本——历史永不被改写。

## 成功判据 ↔ 测试对照

| 判据 | 测试 |
| --- | --- |
| 结构→文本→结构 往返语义不变 | `tests/roundtrip.test.ts` |
| 非法文本时可视化区停留最近合法态、恢复后重同步 | `tests/syncController.test.ts` |
| 预览表单拦截违规输入、放行合法输入并定位字段 | `tests/validate.test.ts` |
| 导出再导入得到等价结构 | `tests/importExport.test.ts` |
| 回滚后内容与所选版本一致 | `tests/documents.test.ts` / `tests/api.test.ts` |
| 多文档独立、并发编辑不串号 | `tests/documents.test.ts` / `tests/api.test.ts` |
| 落盘持久化跨重启恢复 | `tests/documents.test.ts` |
