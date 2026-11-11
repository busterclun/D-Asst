# D-Asst 开源项目复用调研

## 1. 调研目标

在进入正式开发前，优先复用经过验证的架构与系统集成方案，减少重复造轮子和实现风险。但“参考”不等于直接复制整个项目：任何代码复用都必须满足许可证、依赖安全、维护活跃度、架构匹配和可测试性要求。

本轮调研仅建立候选清单和复用方向。阶段四开始前还需对优先候选执行源码级审计、构建验证和依赖扫描。

## 2. 推荐候选

| 优先级 | 项目 | 技术栈与许可证 | 最值得参考 | 不建议直接复制 |
|---|---|---|---|---|
| A | [TaskHaven](https://github.com/maiev1892/taskhaven) | Tauri、React、SQLite，MIT | 领域/应用/基础设施分层、SQLite 适配器、Windows 打包、提醒、自动备份、JSON 恢复、主题系统 | 不直接采用产品 UI 和业务命名；先验证仓库中已完成能力与 README 声明一致 |
| A | [Orange Schedule](https://github.com/OrangeCatzhang/orange-schedule) | Electron、原生 JS/CSS，MIT | Windows 托盘、开机启动、睡眠恢复补发提醒、重复任务范围、打包测试和中英文 Windows 行为 | 技术栈与目标不同，不复制 Electron 主架构或视觉代码；提炼系统行为和测试用例 |
| B | [Cling](https://github.com/sabiqsabry/Cling) | Tauri、React、TypeScript、SQLite/SQLCipher，MIT | 日/周/月、多视图、自然语言解析、rrule、Zustand、TanStack Query、时间块拖动的模块划分 | 项目明确说明 Rust 后端仍为简化状态，不能把 README 功能当作已验证实现 |
| B | [Desktop Weekly Planner](https://github.com/williampepple1/desktop-weekly-planner) | Tauri、React、TypeScript、SQLite，MIT | 周视图、拖拽和基础 Tauri/SQLite 项目结构 | 功能范围较小，只适合作为局部实现参考 |
| B | [Super Productivity](https://github.com/super-productivity/super-productivity) | Electron/Angular，开源项目 | 成熟任务规划、时间盒、快捷键、深链和长期产品经验 | 体量大、框架不同；只研究交互和边界，不移植主体代码 |
| C | [Pikos](https://github.com/Pikos-App/pikos) | Tauri、React、SQLite，BUSL 1.1 | Local First、FTS5 搜索、快速自然语言录入、Rust 数据层与迁移 | 商业再发布受 BUSL 1.1 限制，D-Asst 面向公开发布，不复制代码 |
| C | [Vikunja](https://github.com/go-vikunja/vikunja) | Vue/Go，AGPL-3.0-or-later | 成熟任务、重复、日历与列表模型 | AGPL 会带来强传染性公开源码义务，除非明确接受 AGPL，否则只研究行为 |

## 3. 首选复用策略

### 3.1 TaskHaven：架构骨架候选

优先审计以下内容：

- 领域层与 React/Tauri 解耦方式。
- SQLite schema、迁移与 Repository 接口。
- Windows 本地提醒和通知点击路由。
- JSON 备份、恢复校验和自动快照。
- NSIS/MSI 打包与签名更新流程。
- 浅色、深色和跟随系统主题实现。

如果代码质量和测试通过，可借鉴目录结构或复用独立模块。所有复用文件必须保留 MIT 许可证要求的版权与许可声明。

### 3.2 Orange Schedule：Windows 行为与测试候选

这个项目与 D-Asst 在 Windows 行为上高度相似，适合提炼：

- 关闭窗口后托盘继续运行。
- 开机启动状态验证。
- 睡眠恢复后的提醒补发和去重。
- 重复任务默认“仅此次”与系列操作。
- Windows 安装包、任务栏身份和提醒测试脚本。

由于它使用 Electron 和 JSON 文件存储，不能直接作为 D-Asst 的 Tauri/SQLite 基础工程。

### 3.3 Cling：功能拆分与依赖候选

可研究：

- `chrono-node` 与 `rrule` 的自然语言时间和重复规则处理。
- Zustand 与 TanStack Query 的职责边界。
- Calendar、Timeline、Habit 等功能模块拆分。
- 时间块拖动与全局快捷操作。

在确认数据库与 Rust 模块真实完成度前，不复用其数据层和系统集成代码。

## 4. 不建议直接采用的方案

### 4.1 直接 Fork 某个完整产品

原因：

- D-Asst 的任务模型明确区分分类、象限、计划时间、截止时间、提醒和重复规则，候选项目很少完全一致。
- 完整 Fork 会继承不必要功能、旧依赖、品牌资产和历史技术债。
- 后续很难保证 Figma 设计系统与代码结构一致。

### 4.2 复制 BUSL 或 AGPL 项目代码

- Pikos 的 BUSL 1.1 不允许当前阶段的商业再分发式复制。
- Vikunja 的 AGPL 会对衍生网络应用和分发带来公开源码义务。
- 在没有明确接受对应许可证前，只允许研究公开接口、行为和架构思想，不复制实现代码。

### 4.3 仅凭 README 判断可用性

候选项目的功能声明必须通过源码、测试和实际构建验证。星标数量、截图和 README 不能替代质量审计。

## 5. 开发前源码审计清单

对 A/B 级候选逐项执行：

1. 检查 LICENSE、NOTICE 和依赖许可证。
2. 检查最近提交、发布和未解决安全问题。
3. 本地构建 Windows 开发版与安装包。
4. 运行现有单元、集成和打包测试。
5. 检查是否包含硬编码密钥、遥测或云端依赖。
6. 检查 SQLite schema、迁移回滚和并发写入策略。
7. 检查提醒在安装、托盘、重启和睡眠恢复后的行为。
8. 检查依赖漏洞、废弃包和 Rust `unsafe` 使用。
9. 记录可独立复用的模块、必要修改和许可证归属。
10. 为每个复用模块编写 D-Asst 适配测试，不直接粘贴后即视为完成。

## 6. 建议的采用决策

```text
基础工程
  → 仍由 D-Asst 自行初始化，保持干净的 Tauri 2 架构

架构与数据层
  → 优先参考 TaskHaven

Windows 托盘、启动、提醒与测试场景
  → 重点参考 Orange Schedule

自然语言、重复规则、时间块和状态层
  → 选择性参考 Cling

成熟产品交互与边界案例
  → 研究 Super Productivity
```

结论：不建议整仓复制。最节省时间和 Token 的方式是“先审计、再按模块复用”，把许可证清晰且测试覆盖较好的模块接入 D-Asst 的统一领域模型。

