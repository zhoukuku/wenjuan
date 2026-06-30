// 问卷助手 - 主内容脚本
// 自动检测问卷平台，加载对应适配器，初始化所有模块
// 支持 React/Vue SPA 等异步加载问卷内容的页面

(async function main() {
  'use strict';

  // 防止重复注入
  if (window.__wj_initialized) return;
  window.__wj_initialized = true;

  // ---- 获取域名 ----
  const hostname = window.location.hostname;

  // ---- 选择适配器 ----
  const adapterList = [
    // 国内主流
    { domains: /wjx\.cn|wjx\.com|sojump\.com|sojiang\.com/i, adapter: WenjuanxingAdapter },
    { domains: /wj\.qq\.com/i, adapter: TencentAdapter },
    { domains: /1diaocha\.com/i, adapter: Diaocha1Adapter },
    { domains: /idiaocha\.com/i, adapter: IdiaochaAdapter },
    { domains: /toupiao\.com|jisiba\.com|sutiaoba\.com|votebar\.com/i, adapter: ToupiaoAdapter },
    { domains: /nfieldcn\.com|nfield\.com/i, adapter: NfieldAdapter },
    { domains: /ctrchina\.cn/i, adapter: BaseAdapter },
    { domains: /wenjuan\.com/i, adapter: BaseAdapter },
    // 国际平台
    { domains: /surveymonkey\.com/i, adapter: BaseAdapter },
    { domains: /qualtrics\.com/i, adapter: BaseAdapter },
    { domains: /typeform\.com/i, adapter: BaseAdapter },
    { domains: /surveynetwork\.com|surveyjunkie\.com/i, adapter: BaseAdapter },
    { domains: /toluna\.com/i, adapter: BaseAdapter },
    { domains: /yougov\.com/i, adapter: BaseAdapter },
    { domains: /prolific\.com/i, adapter: BaseAdapter },
    { domains: /swagbucks\.com/i, adapter: BaseAdapter },
    { domains: /ipsos\.com|ipsos-isay\.com/i, adapter: BaseAdapter },
    { domains: /lifepoints/i, adapter: BaseAdapter },
  ];

  let adapter = BaseAdapter;
  for (const item of adapterList) {
    if (item.domains.test(hostname)) {
      adapter = item.adapter;
      break;
    }
  }

  // ---- 用 Proxy 包装适配器，缺失方法自动回退到 BaseAdapter ----
  // 平台适配器通常只覆盖 getQuestions/getOptions 等核心方法，
  // isQuestionAnswered/scrollToQuestion 等通用方法需从 BaseAdapter 继承
  const rawAdapter = adapter;
  adapter = new Proxy(rawAdapter, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop in BaseAdapter) {
        const baseMethod = BaseAdapter[prop];
        return typeof baseMethod === 'function' ? baseMethod.bind(target) : baseMethod;
      }
      return undefined;
    }
  });

  console.log('[问卷助手] 使用适配器:', adapter.name);

  // ---- 初始化状态 ----
  let modulesInitialized = false;

  // ---- 注入指示器 ----
  function injectIndicator() {
    if (document.getElementById('wj-indicator')) return;
    const dot = document.createElement('div');
    dot.id = 'wj-indicator';
    dot.style.cssText = `
      position: fixed; bottom: 12px; left: 12px; z-index: 999999;
      width: 10px; height: 10px; border-radius: 50%;
      background: #4caf50; box-shadow: 0 0 6px rgba(76,175,80,0.4);
      pointer-events: none;
    `;
    dot.title = '问卷助手已激活';
    document.body.appendChild(dot);
  }

  // ---- 初始化各模块 ----
  async function initModules() {
    if (modulesInitialized) return;
    modulesInitialized = true;

    try {
      injectIndicator();
      await Progress.init(adapter);
      await Attention.init(adapter);
      await AI.init();
      await Consistency.init(adapter);
      await Suggest.init(adapter);
      await Autofill.init(adapter);
      await WechatMode.init();
      await Snippets.init();
      await Keyboard.init(adapter);

      console.log('[问卷助手] 所有模块初始化完成');
      console.log(`  适配器: ${adapter.name}`);
      console.log(`  快捷键: 1-9选择 | Tab/Enter下一题 | 0清除 | Ctrl+Shift+F填片`);
    } catch (err) {
      console.error('[问卷助手] 初始化失败:', err);
      modulesInitialized = false;
    }
  }

  // ---- 暴露 API ----
  window.__wj_api = {
    adapter,
    refresh: () => {
      if (modulesInitialized) {
        Progress.update();
        Attention.scanAll();
      }
    },
    getProgress: () => {
      const questions = adapter.getQuestions();
      const answered = questions.filter(q => adapter.isQuestionAnswered(q)).length;
      return { answered, total: questions.length };
    },
    getAdapterName: () => adapter.name,
    isActive: () => modulesInitialized,
  };

  // ---- 监听 popup 消息 ----
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'getSurveyInfo':
        const questions = adapter.getQuestions();
        const answered = questions.filter(q => adapter.isQuestionAnswered(q)).length;
        sendResponse({
          adapter: adapter.name,
          totalQuestions: questions.length,
          answeredQuestions: answered,
          url: window.location.href,
          title: document.title,
          active: modulesInitialized
        });
        break;
      case 'refresh':
        if (modulesInitialized) {
          Progress.update();
          Attention.scanAll();
        }
        sendResponse({ ok: true, active: modulesInitialized });
        break;
      case 'forceActivate':
        // 强制激活：跳过 isSurvey 检测
        if (!modulesInitialized) {
          console.log('[问卷助手] 收到强制激活指令');
          initModules();
        }
        sendResponse({ ok: true });
        break;
      default:
        sendResponse(null);
    }
    return true;
  });

  // ---- 智能检测：立即尝试 + 延迟重试 + DOM 监听 ----

  async function tryActivate() {
    if (modulesInitialized) return;

    if (adapter.isSurvey()) {
      console.log('[问卷助手] 检测到问卷，初始化...');
      await initModules();
      return true;
    }
    return false;
  }

  // 1) 立即尝试
  let activated = await tryActivate();

  // 2) 延迟重试（等待 SPA 渲染，1s / 3s / 8s）
  if (!activated) {
    for (const delay of [1000, 3000, 8000]) {
      activated = await new Promise(resolve => {
        setTimeout(async () => {
          resolve(await tryActivate());
        }, delay);
      });
      if (activated) break;
    }
  }

  // 3) 持续监听 DOM 变化（处理更晚的异步加载）
  if (!activated) {
    console.log('[问卷助手] 未检测到问卷，启动 DOM 监听等待...');
    let checkTimer = null;
    const observer = new MutationObserver(() => {
      // 防抖：500ms 内的变化合并
      clearTimeout(checkTimer);
      checkTimer = setTimeout(async () => {
        if (!modulesInitialized && adapter.isSurvey()) {
          console.log('[问卷助手] DOM 变化后检测到问卷，初始化...');
          observer.disconnect();
          await initModules();
        }
      }, 500);
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });

    // 120 秒后停止监听（节省资源）
    setTimeout(() => {
      observer.disconnect();
      if (!modulesInitialized) {
        console.log('[问卷助手] 等待超时，停止监听。可通过 popup 强制激活。');
      }
    }, 120000);
  }
})();
