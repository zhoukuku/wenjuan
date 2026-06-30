// 问卷助手 - Popup 脚本

document.addEventListener('DOMContentLoaded', async () => {
  // ---- 元素引用 ----
  const infoStatus = document.getElementById('info-status');
  const infoAdapter = document.getElementById('info-adapter');
  const infoProgress = document.getElementById('info-progress');
  const toggleKeyboard = document.getElementById('toggle-keyboard');
  const toggleSnippets = document.getElementById('toggle-snippets');
  const toggleAttention = document.getElementById('toggle-attention');
  const toggleProgress = document.getElementById('toggle-progress');
  const btnOptions = document.getElementById('btn-options');
  const btnRefresh = document.getElementById('btn-refresh');

  // ---- 加载开关状态 ----
  async function loadToggles() {
    const keys = ['keyboardEnabled', 'snippetsEnabled', 'attentionEnabled', 'progressEnabled'];
    const result = await chrome.storage.sync.get(keys);
    toggleKeyboard.checked = result.keyboardEnabled !== false;
    toggleSnippets.checked = result.snippetsEnabled !== false;
    toggleAttention.checked = result.attentionEnabled !== false;
    toggleProgress.checked = result.progressEnabled !== false;
  }
  await loadToggles();

  // ---- 开关变更 ----
  toggleKeyboard.addEventListener('change', () => {
    chrome.storage.sync.set({ keyboardEnabled: toggleKeyboard.checked });
  });
  toggleSnippets.addEventListener('change', () => {
    chrome.storage.sync.set({ snippetsEnabled: toggleSnippets.checked });
  });
  toggleAttention.addEventListener('change', () => {
    chrome.storage.sync.set({ attentionEnabled: toggleAttention.checked });
  });
  toggleProgress.addEventListener('change', () => {
    chrome.storage.sync.set({ progressEnabled: toggleProgress.checked });
  });

  // ---- 查询当前标签页的问卷信息 ----
  async function refreshInfo() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        infoStatus.textContent = '无法获取页面';
        infoStatus.style.color = '#999';
        return;
      }

      const response = await chrome.tabs.sendMessage(tab.id, { type: 'getSurveyInfo' });

      if (response && response.active && response.totalQuestions > 0) {
        // 已激活且有题目
        infoStatus.textContent = '✅ 已激活';
        infoStatus.style.color = '#4caf50';
        infoAdapter.textContent = response.adapter;
        infoProgress.textContent = `${response.answeredQuestions}/${response.totalQuestions} 题`;
      } else if (response && response.active) {
        // 已激活但还没检测到题目
        infoStatus.textContent = '⏳ 等待题目加载...';
        infoStatus.style.color = '#2196f3';
        infoAdapter.textContent = response.adapter;
        infoProgress.textContent = '-';
      } else if (response && !response.active) {
        // 注入成功但未激活（可能在等待 DOM 渲染）
        infoStatus.textContent = '⏳ 等待问卷渲染...';
        infoStatus.style.color = '#ff9800';
        infoAdapter.textContent = response.adapter;
        infoProgress.textContent = '-';
        // 显示强制激活按钮
        showForceButton();
      }
    } catch (err) {
      // Content script 未注入
      infoStatus.textContent = '❌ 非问卷页面';
      infoStatus.style.color = '#f44336';
      infoAdapter.textContent = '-';
      infoProgress.textContent = '-';
      hideForceButton();
    }
  }

  // ---- 强制激活按钮 ----
  function showForceButton() {
    if (document.getElementById('btn-force')) return;
    const btnForce = document.createElement('button');
    btnForce.id = 'btn-force';
    btnForce.className = 'btn-primary';
    btnForce.textContent = '🚀 强制激活';
    btnForce.style.cssText = 'width:100%; margin-top:8px;';
    btnForce.addEventListener('click', async () => {
      btnForce.textContent = '⏳ 激活中...';
      btnForce.disabled = true;
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
          await chrome.tabs.sendMessage(tab.id, { type: 'forceActivate' });
        }
      } catch (_) {}
      setTimeout(() => refreshInfo(), 800);
    });
    document.querySelector('.section').appendChild(btnForce);
  }

  function hideForceButton() {
    const btn = document.getElementById('btn-force');
    if (btn) btn.remove();
  }

  await refreshInfo();

  // ---- 刷新按钮 ----
  btnRefresh.addEventListener('click', async () => {
    btnRefresh.textContent = '⏳ 刷新中...';
    btnRefresh.disabled = true;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        await chrome.tabs.sendMessage(tab.id, { type: 'refresh' });
      }
    } catch (_) {}

    await refreshInfo();
    btnRefresh.textContent = '🔄 刷新状态';
    btnRefresh.disabled = false;
  });

  // ---- 微信模式 ----
  const toggleWechat = document.getElementById('toggle-wechat');

  // 加载微信模式状态
  {
    const result = await new Promise(r => chrome.storage.local.get('wechatMode', r));
    toggleWechat.checked = !!result.wechatMode;
  }

  toggleWechat.addEventListener('change', async () => {
    chrome.storage.local.set({ wechatMode: toggleWechat.checked });
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'toggleWechatMode',
          enabled: toggleWechat.checked
        });
      }
    } catch (_) {}
  });

  // ---- 一键填充按钮 ----
  const btnFillAll = document.getElementById('btn-fill-all');
  const btnGrade = document.getElementById('btn-grade');

  btnFillAll.addEventListener('click', async () => {
    btnFillAll.textContent = '⏳ 填充中...';
    btnFillAll.disabled = true;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        const res = await chrome.tabs.sendMessage(tab.id, { type: 'autofillAll' });
        btnFillAll.textContent = `✅ 已填充 ${res.filled || 0} 题`;
      }
    } catch (_) {
      btnFillAll.textContent = '❌ 请在问卷页面使用';
    }
    setTimeout(() => {
      btnFillAll.textContent = '🚀 一键填充整页';
      btnFillAll.disabled = false;
    }, 2000);
  });

  // ---- 自动答题按钮 ----
  const btnAutoPilot = document.getElementById('btn-auto-pilot');

  btnAutoPilot.addEventListener('click', async () => {
    const isRunning = btnAutoPilot.classList.contains('running');
    btnAutoPilot.disabled = true;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        if (isRunning) {
          await chrome.tabs.sendMessage(tab.id, { type: 'stopAutoPilot' });
          btnAutoPilot.classList.remove('running');
          btnAutoPilot.textContent = '🤖 自动答题 (5-10s)';
        } else {
          await chrome.tabs.sendMessage(tab.id, { type: 'startAutoPilot', speed: 'normal' });
          btnAutoPilot.classList.add('running');
          btnAutoPilot.textContent = '⏹ 停止自动答题';
        }
      }
    } catch (_) {
      btnAutoPilot.textContent = '❌ 请在问卷页面使用';
    }

    btnAutoPilot.disabled = false;
    setTimeout(() => window.close(), 500); // 自动关闭popup
  });

  btnGrade.addEventListener('click', async () => {
    btnGrade.textContent = '⏳ 标记中...';
    btnGrade.disabled = true;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        await chrome.tabs.sendMessage(tab.id, { type: 'gradeOptions' });
        btnGrade.textContent = '✅ 已标记';
      }
    } catch (_) {
      btnGrade.textContent = '❌ 请在问卷页面使用';
    }
    setTimeout(() => {
      btnGrade.textContent = '🏷️ 分级标记选项';
      btnGrade.disabled = false;
    }, 2000);
  });

  // ---- 设置按钮 ----
  btnOptions.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});
