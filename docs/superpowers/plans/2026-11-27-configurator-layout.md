# Configurator Layout Adjustment Implementation Plan

状态：已实现

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `/configurator` 正文按现有最大宽度居中，顶部标题与版本号基线对齐，底部改动统计在左、步骤按钮组在右。

**Architecture:** 只改页面与步骤根容器的 Tailwind 布局类，不新增组件或全局样式。版本页、问卷页、区域页与完成页继续保留各自 `max-w-3xl` / `max-w-6xl`，通过 `mx-auto w-full` 在内容区居中；页面顶栏与底栏在 `ConfiguratorPage` 内调整。

**Tech Stack:** React、TypeScript、Tailwind CSS、Vitest、Testing Library、Vite。

**Spec:** [2026-11-27-configurator-layout-design.md](../specs/2026-11-27-configurator-layout-design.md)

## Global Constraints

- 分支：`fix/configurator-layout`。
- 纯前端，运行时零外部请求；不新增后端、依赖、CDN 或全局样式文件。
- 界面文案中文；最小宽度 1024px，不做移动端适配。
- 不改步骤内容、控件行为、草稿持久化、配置生成逻辑或体检页。
- 不新增 `any`，不新增普通源码注释，`npm run lint` 必须零告警。
- 不创建 git 提交，除非用户另行明确要求。

## Review Focus

- 1024px 宽度下正文不得产生横向滚动；由 Task 3 的浏览器几何检查覆盖。
- 版本页与问卷页保持 `max-w-3xl`，字段密集页保持 `max-w-6xl`；由 Task 1 的定向测试与 Task 3 的宽度检查覆盖。
- 区域页 `xl` 双列与说明栏断点不被居中调整改变；由 Task 3 的 1440px / 1024px 浏览器检查覆盖。
- 顶栏标题与版本号必须共享视觉基线，右侧操作保持垂直居中；由 Task 3 的浏览器检查覆盖。
- 底栏改动统计在 DOM 与视觉上都位于按钮组之前；DOM 顺序由 Task 2 的测试覆盖，视觉位置由 Task 3 覆盖。

---

### Task 1: 居中各步骤根容器

**Files:**

- Modify: `src/components/configurator/VersionStep.tsx:52`
- Modify: `src/components/configurator/RegionStep.tsx:88`
- Modify: `src/components/configurator/ScenarioStep.tsx:497`
- Modify: `src/components/configurator/FinishStep.tsx:56`

**Interfaces:**

- Consumes: 各组件现有 props 与 `max-w-3xl` / `max-w-6xl` 宽度契约。
- Produces: 所有步骤根容器均为 `w-full`、水平自动边距居中，最大宽度不变。

- [ ] **Step 1: 为四个步骤根容器补居中类**

将 `VersionStep` 的 `max-w-3xl`、`ScenarioStep` 的 `max-w-3xl`、`FinishStep` 的 `max-w-6xl` 分别改为 `mx-auto w-full max-w-3xl` / `mx-auto w-full max-w-6xl`；`RegionStep` 的 `fieldHeavy` 与普通分支分别改为 `mx-auto w-full max-w-6xl` 和 `mx-auto w-full max-w-3xl`。

- [ ] **Step 2: 运行定向测试**

Run: `npx vitest run tests/configuratorPage.test.tsx tests/finishStep.test.tsx`
Expected: PASS，现有步骤渲染与完成页行为不变。

### Task 2: 对齐顶栏并重排底栏

**Files:**

- Modify: `src/components/configurator/ConfiguratorPage.tsx:321-336`
- Modify: `src/components/configurator/ConfiguratorPage.tsx:357-366`
- Test: `tests/configuratorPage.test.tsx`

**Interfaces:**

- Consumes: 现有 `Button`、`RepoLink`、`changeCount(draft)` 与导航禁用逻辑。
- Produces: 顶栏左侧标题/版本组使用基线对齐；底栏第一个子项为改动统计，最后一个子项为按钮组。

- [ ] **Step 1: 写底栏 DOM 顺序的失败测试**

在 `tests/configuratorPage.test.tsx` 新增：

```tsx
test('底栏先显示改动统计，再显示步骤操作', async () => {
  render(
    <MemoryRouter>
      <ConfiguratorPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: '选择版本' });

  const count = screen.getByText('已改 0 项');
  const previous = screen.getByRole('button', { name: '上一步' });
  expect(count.compareDocumentPosition(previous) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/configuratorPage.test.tsx -t '底栏先显示改动统计'`
Expected: FAIL，当前实现里按钮在改动统计之前。

- [ ] **Step 3: 调整顶栏结构**

把 `h1` 与版本号 `span` 收进同一个 `flex items-baseline gap-2` 容器，两者统一 `leading-5`；右侧返回体检与 `RepoLink` 容器保持 `self-center`，原有弹性留白不变。

- [ ] **Step 4: 调整底栏结构**

将「已改 N 项」移到按钮组之前，保留一个 `flex-1` 弹性留白；「上一步 / 下一步」放入右侧 `flex items-center gap-2` 容器，禁用条件与点击处理不变。

- [ ] **Step 5: 运行页面测试确认通过**

Run: `npx vitest run tests/configuratorPage.test.tsx`
Expected: PASS，包括新增顺序测试与全部现有导航测试。

### Task 3: 浏览器复核、全量验证与文档收口

**Files:**

- Modify: `docs/superpowers/specs/2026-11-27-configurator-layout-design.md`
- Modify: `docs/superpowers/specs/2026-11-19-configurator-design.md:70-80`
- Modify: `docs/superpowers/specs/2026-11-20-configurator-step-skeleton-design.md:63-68`
- Modify: `docs/superpowers/plans/2026-11-27-configurator-layout.md`

**Interfaces:**

- Consumes: Task 1 与 Task 2 的页面布局。
- Produces: 已实现状态的设计文档、更新后的骨架说明，以及通过的浏览器与构建验证。

- [ ] **Step 1: 启动开发服务器并在浏览器复核**

Run: `npm run dev`
在 1440px 与 1024px 两个宽度分别检查版本页和一个字段密集区域页：

- 正文根容器左右间距相等；版本页最大宽度为 768px，字段密集页最大宽度为 1152px，窄屏时收缩到可用宽度。
- 页面与内容区均无横向滚动。
- 区域页在 1440px 保持字段与说明栏双列，在 1024px 回退为字段优先的单列。
- 标题与版本号视觉基线一致；底栏改动统计在左、按钮组贴右。

- [ ] **Step 2: 运行完整检查与构建**

Run: `npm run check`
Expected: lint、format、typecheck、test 全部通过。

Run: `npm run build`
Expected: lint、typecheck 与 Vite 构建全部通过。

- [ ] **Step 3: 同步文档现状**

将新布局设计状态改为「已实现」；在 2026-11-19 整体设计的页面骨架图中把底栏改为「已改 N 项 → 上一步 / 下一步」；在 2026-11-20 步骤骨架设计的布局章节链接到新布局设计，说明页面级居中由该文档维护，不复制实现细节。

- [ ] **Step 4: 标记计划完成**

将本计划文件头改为「状态：已实现」，不勾选或改写正文步骤。
