# D-Asst Figma 设计状态（已进入 Penpot 迁移）

> 2026-11-11：因 Figma Starter 与官方 MCP 配额限制，后续设计平台改为 Penpot。原 Figma 文件作为只读迁移源和备份保留；用户已确认 Penpot 导出包已导入。迁移步骤与核验清单见 [PENPOT_MIGRATION.md](./PENPOT_MIGRATION.md)。

## 文件

- 文件名：`D-Asst Design System`
- 地址：<https://www.figma.com/design/Y4l8pmCw35ikjE1OcR87yx>
- 文件 Key：`Y4l8pmCw35ikjE1OcR87yx`
- 当前套餐：Figma Starter
- 字体：Noto Sans SC

## 已完成

### 文件结构

Starter 套餐每个文件最多 3 个页面，因此将原计划的 8 页压缩为 3 页，并用 Section 保留逻辑分区：

1. `01 Library`
2. `02 Product Design`
3. `03 Landing & Handoff`

### 变量与样式

- `spacing`：13 个变量。
- `radius`：9 个变量。
- `Core Colors`：Primary、Secondary、Accent、Grayscale、Red、Green、Yellow 各 10 阶，以及 Grayscale-Alpha。
- `Color System`：Light 语义颜色。
- `Color System · Dark`：Dark 语义颜色。
- 26 个 Noto Sans SC 文字样式。
- 4 个阴影样式。

Starter 套餐不支持第二个变量模式，因此暂时以 Light / Dark 两个语义集合保存同构 token。升级套餐后可把 Dark 别名迁回 `Color System` 的 Dark mode，无需改动 Core Colors。

### 可视基础页

- `01 Foundations`：D-Asst 品牌封面、品牌色、产品定位、预览水印。
- `02 Design Tokens`：语义色、Light / Dark 对照、排版样张。
- `03 Components`：组件库总览。

### 已创建组件

- Icon：Plus、Check、Search、Calendar、Clock、ChevronDown、Sparkle、Menu。
- Button：5 Type × 6 State，共 30 个变体。
- Icon Button：3 Type × 6 State，共 18 个变体。
- Input、Checkbox、Switch 组件集。
- Search、Dropdown、Date Picker、Time Picker、Time Range Selector。
- Task Card、Task List Item、Category Badge、Priority Badge。
- Calendar Cell、Week Column、Month Grid。
- Modal、Toast、Progress Ring、Navigation Sidebar、Reminder Card。

## 未完成队列

Figma MCP 在开始写入业务页面时触发 Starter 调用额度上限，该次写入未执行。额度恢复或套餐升级后，按以下顺序继续：

1. `04 Application Screens`
   - Dashboard / Today
   - Tasks / Quadrants
   - Tasks / List
   - Calendar / Week
   - Calendar / Month
   - Calendar / Day Focus
   - Create Task
   - Task Detail
   - AI Import
   - AI Confirmation
   - Reminder Settings
   - App Settings（Dark）
2. `05 Interaction States`
   - 加载、空状态、错误、离线、权限拒绝、提醒触发。
3. `06 User Flows`
   - AI 录入、重复任务编辑、首次关闭窗口、周视图拖动。
4. `07 Landing Page`
   - 主 CTA：加入测试名单。
   - 次 CTA：查看设计预览。
5. `08 Developer Handoff`
   - Token 映射、组件 API、Windows 行为说明、开发验收清单。

## 已确认的设计约束

- 产品正式名称为 D-Asst。
- 正式公开版显示低干扰 `D-Asst` 品牌水印；预览和测试版显示 `D-Asst · Preview`。
- 首版支持浅色、深色与跟随系统。
- 通知只承担提醒和点击打开任务，不提供延后或完成按钮。
- 重复任务默认编辑“仅此次”，可选择“整个系列”。
- 首次关闭窗口询问“最小化到托盘”或“退出”，并记住选择。
- 周视图 P0 支持拖动时间块。

