// 问卷助手 - 设置页面脚本

document.addEventListener('DOMContentLoaded', async () => {
  // ---- 标签页切换 ----
  const navItems = document.querySelectorAll('.nav-item');
  const tabContents = document.querySelectorAll('.tab-content');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.dataset.tab;
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      tabContents.forEach(t => t.classList.remove('active'));
      document.getElementById(`tab-${tab}`).classList.add('active');

      if (tab === 'about') loadStats();
    });
  });

  // ---- 片段管理 ----
  const snippetList = document.getElementById('snippet-list');
  const newLabel = document.getElementById('new-label');
  const newValue = document.getElementById('new-value');
  const btnAdd = document.getElementById('btn-add');
  const btnReset = document.getElementById('btn-reset-snippets');
  const btnSave = document.getElementById('btn-save-snippets');
  const snippetHint = document.getElementById('snippet-hint');

  let snippets = [];

  async function loadSnippets() {
    const result = await chrome.storage.sync.get('snippets');
    snippets = result.snippets || [];
    renderSnippets();
  }

  function renderSnippets() {
    snippetList.innerHTML = snippets.map((s, i) => `
      <div class="snippet-row" data-index="${i}">
        <input type="text" class="snippet-label" value="${escapeHtml(s.label)}" placeholder="标签">
        <input type="text" class="snippet-value" value="${escapeHtml(s.value)}" placeholder="值">
        <button class="btn-delete" title="删除">✕</button>
      </div>
    `).join('');

    // 绑定删除按钮
    snippetList.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const row = e.target.closest('.snippet-row');
        const index = parseInt(row.dataset.index);
        snippets.splice(index, 1);
        renderSnippets();
      });
    });

    // 绑定输入变更
    snippetList.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', () => {
        // 实时更新 snippets 数组
        const rows = snippetList.querySelectorAll('.snippet-row');
        snippets = Array.from(rows).map(row => ({
          label: row.querySelector('.snippet-label').value.trim(),
          value: row.querySelector('.snippet-value').value.trim(),
          type: 'text'
        }));
      });
    });
  }

  btnAdd.addEventListener('click', () => {
    const label = newLabel.value.trim();
    const value = newValue.value.trim();
    if (!label) {
      snippetHint.textContent = '请输入标签名';
      snippetHint.style.color = '#f44336';
      return;
    }
    snippets.push({ label, value, type: 'text' });
    renderSnippets();
    newLabel.value = '';
    newValue.value = '';
    newLabel.focus();
  });

  // Enter 键添加
  newValue.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnAdd.click();
  });

  btnSave.addEventListener('click', async () => {
    // 从 DOM 重新收集（确保最新）
    const rows = snippetList.querySelectorAll('.snippet-row');
    snippets = Array.from(rows).map(row => ({
      label: row.querySelector('.snippet-label').value.trim(),
      value: row.querySelector('.snippet-value').value.trim(),
      type: 'text'
    })).filter(s => s.label);

    await chrome.storage.sync.set({ snippets });
    snippetHint.textContent = '✅ 已保存！';
    snippetHint.style.color = '#4caf50';
    setTimeout(() => { snippetHint.textContent = ''; }, 2000);
  });

  btnReset.addEventListener('click', async () => {
    if (confirm('确定要恢复默认片段吗？当前片段将被替换。')) {
      const defaults = [
        { label: '姓名', value: '', type: 'text' },
        { label: '性别', value: '男', type: 'text' },
        { label: '年龄', value: '28', type: 'text' },
        { label: '城市', value: '北京', type: 'text' },
        { label: '学历', value: '本科', type: 'text' },
        { label: '职业', value: '企业职员', type: 'text' },
        { label: '月收入', value: '8000-15000元', type: 'text' },
        { label: '邮箱', value: '', type: 'email' },
        { label: '手机号', value: '', type: 'tel' }
      ];
      snippets = defaults;
      await chrome.storage.sync.set({ snippets });
      renderSnippets();
      snippetHint.textContent = '✅ 已恢复默认';
      snippetHint.style.color = '#4caf50';
      setTimeout(() => { snippetHint.textContent = ''; }, 2000);
    }
  });

  // ---- 统计 ----
  async function loadStats() {
    const stats = await new Promise(resolve => {
      chrome.storage.sync.get('stats', result => resolve(result.stats || {}));
    });
    document.getElementById('stat-surveys').textContent = stats.totalSurveys || 0;
    document.getElementById('stat-questions').textContent = stats.totalQuestions || 0;
    document.getElementById('stat-time').textContent = stats.avgTimePerQuestion || '-';
  }

  // ---- 初始化 ----
  await loadSnippets();

  // ---- AI 配置 ----
  const aiEnabled = document.getElementById('ai-enabled');
  const aiEndpoint = document.getElementById('ai-endpoint');
  const aiKey = document.getElementById('ai-key');
  const aiModel = document.getElementById('ai-model');
  const btnTestAi = document.getElementById('btn-test-ai');
  const aiTestResult = document.getElementById('ai-test-result');
  const btnSaveAi = document.getElementById('btn-save-ai');
  const aiHint = document.getElementById('ai-hint');

  const PRESETS = {
    deepseek: { endpoint: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    minimax: { endpoint: 'https://api.minimax.chat/v1', model: 'abab6.5s-chat' },
    qwen: { endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo' },
    glm: { endpoint: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
    openai: { endpoint: 'https://api.openai.com/v1', model: 'gpt-3.5-turbo' }
  };

  // 加载 AI 配置
  chrome.storage.local.get(['aiEnabled', 'aiEndpoint', 'aiKey', 'aiModel'], result => {
    aiEnabled.checked = !!result.aiEnabled;
    aiEndpoint.value = result.aiEndpoint || '';
    aiKey.value = result.aiKey || '';
    aiModel.value = result.aiModel || '';
  });

  // 预设按钮
  document.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = PRESETS[btn.dataset.preset];
      if (preset) {
        aiEndpoint.value = preset.endpoint;
        aiModel.value = preset.model;
        document.querySelectorAll('.btn-preset').forEach(b => {
          b.style.background = '';
          b.style.color = '';
        });
        btn.style.background = '#1976d2';
        btn.style.color = '#fff';
      }
    });
  });

  // 测试连接
  btnTestAi.addEventListener('click', async () => {
    const endpoint = aiEndpoint.value.trim();
    const key = aiKey.value.trim();
    const model = aiModel.value.trim();

    if (!endpoint || !key) {
      aiTestResult.textContent = '❌ 请填写 API 地址和 Key';
      aiTestResult.style.color = '#f44336';
      return;
    }

    btnTestAi.textContent = '⏳ 测试中...';
    btnTestAi.disabled = true;
    aiTestResult.textContent = '';

    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 8000);

      const resp = await fetch(`${endpoint.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: '回复"OK"' }],
          max_tokens: 5
        }),
        signal: controller.signal
      });

      if (resp.ok) {
        const data = await resp.json();
        aiTestResult.textContent = `✅ 连接成功！模型: ${data.model || model}`;
        aiTestResult.style.color = '#4caf50';
      } else {
        const errText = await resp.text();
        aiTestResult.textContent = `❌ ${resp.status}: ${errText.substring(0, 60)}`;
        aiTestResult.style.color = '#f44336';
      }
    } catch (err) {
      aiTestResult.textContent = `❌ ${err.message}`;
      aiTestResult.style.color = '#f44336';
    }

    btnTestAi.textContent = '🔬 测试连接';
    btnTestAi.disabled = false;
  });

  // 保存配置
  btnSaveAi.addEventListener('click', () => {
    chrome.storage.local.set({
      aiEnabled: aiEnabled.checked,
      aiEndpoint: aiEndpoint.value.trim(),
      aiKey: aiKey.value.trim(),
      aiModel: aiModel.value.trim()
    }, () => {
      aiHint.textContent = '✅ 已保存！';
      aiHint.style.color = '#4caf50';
      setTimeout(() => { aiHint.textContent = ''; }, 2000);
    });
  });

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
