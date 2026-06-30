// 问卷助手 - AI 答题引擎
// 支持 OpenAI 兼容 API（DeepSeek / MiniMax / 通义千问 / GLM / GPT 等）

const AI = {
  _enabled: false,
  _endpoint: '',
  _key: '',
  _model: '',
  _pending: null,    // 当前请求的 Promise
  _cache: {},        // 题目文本 → 答案缓存

  /** 预设模型配置 */
  PRESETS: {
    deepseek: {
      name: 'DeepSeek',
      endpoint: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat'
    },
    minimax: {
      name: 'MiniMax',
      endpoint: 'https://api.minimax.chat/v1',
      model: 'abab6.5s-chat'
    },
    qwen: {
      name: '通义千问',
      endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen-turbo'
    },
    glm: {
      name: '智谱 GLM',
      endpoint: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'glm-4-flash'
    },
    openai: {
      name: 'OpenAI',
      endpoint: 'https://api.openai.com/v1',
      model: 'gpt-3.5-turbo'
    }
  },

  /** 系统提示词 */
  SYSTEM_PROMPT: `你是一个正在填写市场调研问卷的普通中国消费者。
请根据题目和选项，选一个最像普通人会选的答案。
规则：
1. 不要选极端选项（如"非常满意""完全不"）
2. 偏好中性偏正面的回答
3. 如果题目问"是否知道/是否用过"，选"是/知道/用过"
4. 如果题目问未来计划，选温和选项（如"可能""考虑"而非"一定"）
5. 对于价格预期题，选"保持不变"或温和变动
6. 只回复选项的完整原文，不要任何解释`,

  /** 初始化 */
  async init() {
    await this._loadConfig();
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && (changes.aiEnabled || changes.aiKey || changes.aiEndpoint || changes.aiModel)) {
        this._loadConfig();
      }
    });
  },

  /** 加载配置 */
  async _loadConfig() {
    return new Promise(resolve => {
      chrome.storage.local.get(['aiEnabled', 'aiEndpoint', 'aiKey', 'aiModel'], result => {
        this._enabled = !!result.aiEnabled;
        this._endpoint = result.aiEndpoint || '';
        this._key = result.aiKey || '';
        this._model = result.aiModel || '';
        resolve();
      });
    });
  },

  /** 是否可用 */
  isReady() {
    return this._enabled && this._key && this._endpoint && this._model;
  },

  /**
   * 让 AI 推荐答案
   * @param {string} questionText - 题目文本
   * @param {Array} options - [{text: '选项文本'}, ...]
   * @returns {Promise<{text: string}|null>}
   */
  async ask(questionText, options) {
    if (!this.isReady()) return null;

    const cacheKey = questionText.substring(0, 80);
    // 检查缓存
    if (this._cache[cacheKey]) {
      return { text: this._cache[cacheKey], source: 'ai-cache' };
    }

    // 构建选项列表
    const optionList = options.map((o, i) => `${i + 1}. ${o.text}`).join('\n');

    const messages = [
      { role: 'system', content: this.SYSTEM_PROMPT },
      { role: 'user', content: `题目：${questionText}\n\n选项：\n${optionList}\n\n请选择一个最合理的选项，只回复选项文本。` }
    ];

    try {
      // 10 秒超时
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const resp = await fetch(`${this._endpoint.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this._key}`
        },
        body: JSON.stringify({
          model: this._model,
          messages: messages,
          max_tokens: 100,
          temperature: 0.3
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!resp.ok) {
        console.warn('[AI] API 返回错误:', resp.status);
        return null;
      }

      const data = await resp.json();
      const answer = data.choices?.[0]?.message?.content?.trim();

      if (answer) {
        // 在选项中找最匹配的
        let best = null;
        for (const opt of options) {
          if (answer.includes(opt.text)) {
            best = opt.text;
            break;
          }
        }
        // 模糊匹配：AI 可能返回不精确的文本
        if (!best) {
          for (const opt of options) {
            const aiWords = answer.replace(/[^一-龥]/g, '');
            const optWords = opt.text.replace(/[^一-龥]/g, '');
            if (aiWords.includes(optWords) || optWords.includes(aiWords)) {
              best = opt.text;
              break;
            }
          }
        }

        const result = best || answer;
        // 缓存
        this._cache[cacheKey] = result;
        return { text: result, source: 'ai' };
      }

      return null;
    } catch (err) {
      if (err.name === 'AbortError') {
        console.warn('[AI] 请求超时');
      } else {
        console.warn('[AI] 请求失败:', err.message);
      }
      return null;
    }
  },

  /** 清除缓存 */
  clearCache() {
    this._cache = {};
  }
};
