# 📋 问卷助手 - Chrome 浏览器插件

高效的问卷调查 Chrome 扩展，支持**键盘快捷键、AI 智能推荐、自动答题、陷阱检测、微信伪装**等 10+ 功能模块，适配 25+ 国内外问卷平台。

[![Version](https://img.shields.io/badge/version-1.0.0-blue)](manifest.json)
[![Manifest](https://img.shields.io/badge/manifest-v3-green)](manifest.json)
[![License](https://img.shields.io/badge/license-MIT-orange)](LICENSE)

---

## 🚀 快速开始

### 安装

1. 打开 Chrome，地址栏输入 `chrome://extensions/`
2. 开启右上角「**开发者模式**」
3. 点击「**加载已解压的扩展程序**」
4. 选择本项目根目录
5. 完成！

### 配置 AI（可选但推荐）

1. 右键插件图标 → 「**⚙️ 选项**」→ 「**🤖 AI 答题**」
2. 选择预设模型（DeepSeek / MiniMax / 通义千问 / 智谱 GLM）
3. 填入 API Key → 点击「🔬 测试连接」→ 「💾 保存」

> 💡 DeepSeek 新用户送 500 万 tokens，够用很久。

---

## ⌨️ 完整快捷键

| 快捷键 | 功能 |
|--------|------|
| `1` - `9` | 选择对应选项（单选立即选中，多选切换） |
| `0` | 清除当前题选择 |
| `Tab` / `Enter` | 下一题 / 下一页 |
| `Shift` + `Tab` | 上一题 |
| `↑` `↓` / `j` `k` | 上下切换题目焦点 |
| `Ctrl` + `Shift` + `F` | 弹出快速填片面板 |
| `Alt` + `Shift` + `F` | 一键填充整页 |
| `Alt` + `G` | 分级标记所有选项（绿👍/黄/橙/红） |
| `Ctrl` + `Shift` + `A` | 🤖 启动/停止自动答题 |
| `Ctrl` + `Z` | 撤销上一次填充 |
| `Esc` | 停止自动答题 |

---

## 🧩 功能模块

| 模块 | 文件 | 功能 |
|------|------|------|
| ⌨️ 键盘导航 | `keyboard.js` | 数字键选择、Tab 翻页、两位数选择、方向键导航 |
| 🧠 智能推荐 | `suggest.js` | 20+ 题型分类 + 策略推断 + 选项分级 |
| 🤖 AI 引擎 | `ai.js` | OpenAI 兼容 API，支持 DeepSeek/MiniMax/千问/GLM/GPT |
| 🚀 一键填充 | `autofill.js` | 整页填充、撤销、**自动答题模式**（5-10s 延迟 + 自动翻页） |
| ⚠️ 陷阱检测 | `attention.js` | 18 条中英文正则 + 矛盾检测 |
| 🔗 一致性 | `consistency.js` | 14 类答案一致性追踪，自动提醒 |
| 📊 进度条 | `progress.js` | 顶部进度条 + 预计剩余时间 |
| 📝 快速填片 | `snippets.js` | 预设常用信息，`Ctrl+Shift+F` 弹出面板 |
| 📱 微信伪装 | `wechat.js` | UA 伪装 + WeixinJSBridge/wx 模拟 |
| 🔧 平台适配 | `adapters/` | 7 个精准适配器 + BaseAdapter v2 通用适配 |

### 🤖 自动答题模式

按 `Ctrl+Shift+A` 启动，插件会自动：

1. 分析每道题 → 找推荐答案
2. 随机等待 5-10 秒（模拟真人）
3. 自动点击推荐选项（单选/多选自动识别）
4. 翻到最后一题自动点「下一页」
5. 到最后一页自动提交
6. 随时按 `Esc` 停止

---

## 🌐 支持的平台

| 类别 | 平台 | 适配器 |
|------|------|--------|
| 🟢 精准 | 问卷星 (wjx.cn) / 收奖网 (sojiang.com) | `WenjuanxingAdapter` |
| 🟢 精准 | 腾讯问卷 (wj.qq.com) | `TencentAdapter` |
| 🟢 精准 | 第一调查网 (1diaocha.com) | `Diaocha1Adapter` |
| 🟢 精准 | 爱调查 (idiaocha.com) | `IdiaochaAdapter` |
| 🟢 精准 | 投吧 / 集思吧 / 速调吧 | `ToupiaoAdapter` |
| 🟢 精准 | Nfield (nfieldcn.com) | `NfieldAdapter` |
| 🔵 通用 | CTR 调查社区、问卷网、SurveyMonkey、Qualtrics、Typeform、Survey Junkie、Toluna、YouGov、Prolific、Swagbucks、Ipsos iSay、LifePoints 等 | `BaseAdapter v2` |

> `BaseAdapter v2` 基于语义 HTML 自动识别题目结构，能覆盖大多数问卷平台。

---

## 📁 项目结构

```
wenjuan/
├── manifest.json              # Chrome Extension Manifest V3
├── background.js              # Service Worker
├── content/
│   ├── content.js             # 主入口（适配器选择 + 模块初始化）
│   ├── content.css            # 注入样式
│   ├── keyboard.js            # 键盘快捷键
│   ├── suggest.js             # 智能推荐引擎（20+ 题型分类）
│   ├── ai.js                  # AI 引擎（OpenAI 兼容 API）
│   ├── autofill.js            # 一键填充 + 自动答题模式
│   ├── attention.js           # 陷阱题检测 + 矛盾检测
│   ├── consistency.js         # 答案一致性追踪
│   ├── progress.js            # 进度条 + 时间估算
│   ├── snippets.js            # 快速填片浮动面板
│   ├── wechat.js              # 微信 UA 伪装
│   └── adapters/
│       ├── base.js            # 通用适配器 v2
│       ├── wenjuanxing.js     # 问卷星 / 收奖网
│       ├── tencent.js         # 腾讯问卷
│       ├── 1diaocha.js        # 第一调查网
│       ├── idiaocha.js        # 爱调查
│       ├── toupiao.js         # 投吧 / 集思吧 / 速调吧
│       └── nfield.js          # Nfield CAPI 平台
├── popup/                     # 弹出窗口（开关 + 一键操作）
├── options/                   # 设置页面（片段管理 + AI 配置）
├── utils/storage.js           # Chrome Storage API 封装
├── assets/                    # 图标
├── generate-icons.js          # 图标生成脚本
└── README.md
```

---

## 🔒 隐私说明

- 所有数据存储在浏览器本地（`chrome.storage.sync` + `chrome.storage.local`）
- AI API Key 存储在 `chrome.storage.local`
- **不会**上传任何问卷内容或个人数据
- **不会**追踪浏览行为
- 仅在问卷页面激活

---

## 🛠 技术栈

- Chrome Extension **Manifest V3**
- 原生 JavaScript（零依赖，无需 npm install）
- `MutationObserver` 监听动态 DOM
- `Proxy` 适配器自动回退
- OpenAI 兼容 API 格式
