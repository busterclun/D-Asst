# D-Asst：Figma → Penpot 迁移说明

## 当前状态

- 源文件：`D-Asst Design System`
- Figma 文件：<https://www.figma.com/design/Y4l8pmCw35ikjE1OcR87yx>
- 迁移方式：Penpot 官方维护的 `Penpot Exporter` Figma 插件
- 插件版本：`v0.26.3`
- 插件源码：<https://github.com/penpot/penpot-exporter-figma-plugin>
- 本地插件清单：`tools/penpot-exporter-figma-plugin/manifest.json`
- 目标文件名：`D-Asst Design System`
- 原 Figma 文件保留，不删除、不覆盖。

当前环境的 Figma MCP Starter 调用额度已经耗尽，且本轮浏览器自动控制不可用，因此导出这一步需要你在 Figma 桌面版手动运行一次插件；导入后的 Penpot 核验仍可继续由我协助。

## 为什么采用官方导出插件

Penpot 不能直接导入 `.fig` 文件。官方导出插件会在 Figma 内读取页面、图层、组件、样式、变量和素材，并生成 Penpot 可导入的文件。与逐页导出 SVG 相比，该方式能保留更多可编辑结构。

## 只需完成的一次人工操作

### 1. 在 Figma 中加载导出插件

1. 使用 Figma 桌面版打开 `D-Asst Design System`。
2. 进入 `Plugins` → `Development` → `Import plugin from manifest…`。
3. 选择：

   ```text
   C:\Users\QIUDONG\Documents\ChatGPT\提醒工具\tools\penpot-exporter-figma-plugin\manifest.json
   ```

4. 运行 `Penpot Exporter`。
5. 导出范围选择 `All pages`，确保包含以下三页：
   - `01 Library`
   - `02 Product Design`
   - `03 Landing & Handoff`
6. 下载导出文件，不要删除或覆盖原 Figma 文件。

### 2. 导入 Penpot

1. 打开 <https://design.penpot.app/> 并登录。
2. 新建项目 `D-Asst`。
3. 在项目菜单选择 `Import files`。
4. 选择刚才导出的 `.penpot` 或 `.zip` 文件。
5. 导入后将文件命名为 `D-Asst Design System`。

## 导入后的核验清单

### 页面与结构

- [ ] 三个页面全部存在。
- [ ] Foundations、Design Tokens、Components 分区可见。
- [ ] 页面、画板、图层名称没有乱码。
- [ ] Noto Sans SC 字体正常；若缺失，在 Penpot 团队设置中上传或选择兼容字体。

### Design Tokens

- [ ] 13 个 spacing token。
- [ ] 9 个 radius token。
- [ ] Core Colors 色阶完整。
- [ ] Light 与 Dark 语义颜色均已保留。
- [ ] 26 个文字样式。
- [ ] 4 个阴影样式。

### 组件

- [ ] Button：5 Type × 6 State。
- [ ] Icon Button：3 Type × 6 State。
- [ ] Input、Checkbox、Switch。
- [ ] Search、Dropdown、Date Picker、Time Picker、Time Range Selector。
- [ ] Task Card、Task List Item、Category Badge、Priority Badge。
- [ ] Calendar Cell、Week Column、Month Grid。
- [ ] Modal、Toast、Progress Ring、Navigation Sidebar、Reminder Card。

### 迁移后修复重点

1. 将 Light / Dark 语义 Token 建成两个 Token Set，并用 Theme 切换，不再沿用 Figma Starter 的双集合兼容方案。
2. 检查组件变体是否被转换成独立组件；必要时用 Penpot Variant 属性重新组织。
3. 检查 Auto Layout 到 Flex Layout 的转换，重点验证按钮、输入框、任务卡和周视图列。
4. 检查字体权重、阴影、圆角、图标描边和蒙版。
5. 确认所有公开预览画面保留 `D-Asst · Preview` 水印。

## 后续设计队列

迁移核验通过后，继续在 Penpot 完成：

1. Application Screens
2. Interaction States
3. User Flows
4. Landing Page
5. Developer Handoff

优先顺序：Dashboard / Today → Create Task → Task Detail → Quadrants → Week → Month → AI Import → Settings → Landing Page。

