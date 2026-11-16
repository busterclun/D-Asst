# D-Asst V2.0

D-Asst 是一款面向 Windows 的本地优先任务管理应用，以极简日/周任务视图、四象限和 AI 自然语言解析为核心。

## 主要功能

- 工作台：今日重点、完成进度和下一个提醒。
- 我的一天：居中的极简每日任务清单。
- 我的一周：周一至周日七列日期级任务视图，可拖动任务改期。
- 我的一月：月历与每日任务摘要。
- 四象限：按“重要/紧急”组合查看和调整任务。
- 任务清单：按分类集中管理全部任务。
- AI 助手：使用自然语言拆解任务、匹配分类、判断四象限、安排日期、识别具体时间和提醒。
- 重复任务：每日任务按日期展开，同一任务不会被重复创建；每一天可独立完成。
- Windows 提醒：任务具有具体时间后，可按准时、提前 5/10/30/60 分钟提醒。
- 本地数据：任务保存在用户电脑，支持 JSON 备份。

## V2.0 重点

- 默认采用日期级计划，不会因安排日期就擅自生成时间段。
- 预计工时、计划日期、截止日期、具体时间和提醒互相独立。
- AI 预览支持手动修改分类、四象限、日期、24 小时制具体时间、工时和提醒。
- 相对时间以北京时间解析，例如 19:40 输入“等下十点”会得到当天 22:00。
- 重复任务只保存一份数据，并按日期生成显示实例。
- 改进启动体验：先显示轻量启动页，托盘和提醒在首屏加载后初始化。

## 直接运行

从 [GitHub Releases](https://github.com/busterclun/D-Asst/releases) 下载 `D-Asst-2.0.0-portable.exe`，双击即可运行，无需安装。

> 当前版本未购买 Windows 代码签名证书。首次运行时 Windows SmartScreen 可能提示“Windows 已保护你的电脑”，请先确认文件来自本仓库，再选择“更多信息 → 仍要运行”。

系统要求：Windows 10/11 x64。

完整操作说明见 [使用说明.md](./使用说明.md)，本次更新见 [RELEASE_NOTES_V2.0.md](./RELEASE_NOTES_V2.0.md)。

## AI 模型配置

进入“设置 → AI 模型”，填写兼容 OpenAI Chat Completions 的服务：

- DeepSeek API 地址：`https://api.deepseek.com`
- 常用模型：`deepseek-chat`
- API Key：用户自己从服务商后台获取

API Key 使用 Electron/Windows 安全存储保存，不写入任务数据，也不会提交到仓库。

## 本地开发

```powershell
npm install
npm run dev
```

检查和构建：

```powershell
npm run typecheck
npm run test:v2
npm run build
npm run dist:win
```

单文件便携版输出到 `dist/D-Asst-2.0.0-portable.exe`。

## 数据位置

- 任务数据：`%APPDATA%\d-asst\d-asst-data.json`
- 自动备份：`%APPDATA%\d-asst\d-asst-data.json.bak`
- AI 配置：`%APPDATA%\d-asst\ai-config.bin`

升级或替换程序文件不会删除上述数据。分享程序时不要附带 `%APPDATA%\d-asst` 目录。

## 技术栈

- Electron
- React
- TypeScript
- Vite

## 隐私说明

普通任务数据默认只保存在本机。只有用户主动点击外部 AI 解析时，输入的自然语言和必要的分类上下文才会发送到用户配置的模型服务商。
