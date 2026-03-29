# MasterGo Vue Exporter

一个用于 MasterGo Dev Mode 的 Vue 代码导出插件，适合与内网版不支持插件与codegen使用。

它的目标不是简单导出一份静态代码，而是尽量把设计稿节点转换成可维护的 Vue 单文件组件，并提供一套可配置的导出参数和提示词管理界面，便于后续做响应式优化、AI 二次改造或项目内接入。

## 功能

- 支持导出 `Vue 3` / `Vue 2`
- 支持 `CSS` / `SCSS`
- 支持重复样式提取
- 支持图片资源导出
- 支持图片资源外置与 `generated-assets.zip` 导出
- 支持根据最近一次 manifest 一键下载 `generated-assets.zip`
- 支持官方 Codegen 开关
- 支持在插件 UI 中保存导出设置
- 支持在插件 UI 中编辑和保存提示词模板

## 项目结构

```text
mastergo-vue-exporter/
├─ lib/            # 插件主逻辑，负责 snippet 生成
├─ ui/             # 设置面板 UI
├─ messages/       # UI 与主逻辑消息定义
├─ prompt.md       # 默认提示词模板
├─ manifest.json   # MasterGo 插件清单
├─ vite.config.ts  # 构建配置
└─ package.json
```

## 本地开发

安装依赖：

```bash
npm install
```

启动监听构建：

```bash
npm run dev
```

单独构建 UI：

```bash
npm run build:ui
```

单独构建主逻辑：

```bash
npm run build:main
```

完整构建：

```bash
npm run build
```

## 在 MasterGo 中使用

1. 先执行构建，确保生成 `dist/main.js` 和 `dist/index.html`
2. 在 MasterGo 中导入或加载插件目录
3. 在 Dev Mode 的 snippet 面板中使用本插件
4. 点击“打开设置”可调整导出参数
5. 在设置面板中可直接编辑并保存提示词
6. 若导出结果包含图片资源，组件内只保留资源路径引用
7. 可在设置面板中下载最近一次生成的 `generated-assets.zip`，压缩包内包含资源文件和 `assets.manifest.json`

## 提示词说明

- `prompt.md` 是默认提示词模板
- 插件 UI 会加载默认提示词
- 如果你在 UI 中修改并保存，内容会存到插件本地存储中
- 当前提示词主要用于人工复制或后续 AI 改造流程，不会自动参与现有导出逻辑

## 说明

当前插件仍以本地规则生成 Vue 代码为主，暂未接入远程自动更新或在线 AI 改写流程。  
如果后续需要，可以继续扩展：

- 远程提示词同步
- AI 二次重构流水线
- 更强的响应式布局规则映射
- 根据 `assets.manifest.json` 自动落盘导出资源文件
