# D-Asst

D-Asst 是一个 Local-first 的 Windows 任务与时间管理应用 MVP，采用 Electron + React + TypeScript 构建，视觉基于 Penpot 中的 D-Asst Design System。

## 当前可运行功能

- 本地任务持久化（Electron 用户数据目录，同时保留浏览器回退存储）
- 任务新增、编辑、删除、完成与重复任务实例生成
- 工作台、四象限、分类清单、我的一天、周视图、月视图
- 周/月视图拖动任务改期
- AI 自然语言任务导入预览与确认（当前为本地结构化解析器）
- Windows 原生提醒、系统托盘、关闭窗口首次询问并记住选择
- Light / Dark / System 主题变量入口
- JSON 数据备份导出
- Ctrl+N 快速创建、Ctrl+F 搜索、Esc 关闭弹窗

## 启动

```powershell
npm install
npm run dev
```

生产前端构建：

```powershell
npm run typecheck
npm run build
```

生成 Windows x64 便携版：

```powershell
npm run dist:win
```

产物会出现在 `release/`。

当前已额外组装可直接双击的便携目录：`release/D-Asst-portable/D-Asst.exe`，桌面上的 `D-Asst.lnk` 已指向该程序。

`npm run dev` 会启动 Vite 和 Electron 桌面窗口。任务数据保存在 Electron 的 userData 目录中，不会写回项目目录。

## 当前已知边界

- 单文件安装器仍需要代码签名与构建工具下载；当前交付的是无需安装的便携版目录。
- 开机启动开关和睡眠恢复后的提醒重算还需要进入真实 Windows 验收阶段。
- AI 导入默认使用本地规则解析；Provider Adapter、API Key 安全存储和远端模型接入作为下一阶段实现。
- 当前深色模式已提供可用主题切换，后续需要进行逐组件对比验收。
