// 问卷助手 - 陷阱题/注意力检测高亮模块
// 通过正则和关键词检测潜在陷阱题，高亮提醒用户

const Attention = {
  _enabled: true,
  _adapter: null,
  _warnedQuestions: new WeakSet(),
  _answerHistory: [], // 用于矛盾检测

  /**
   * 陷阱题模式库（正则）
   * 每条包含 pattern 和 severity: 'high' | 'medium'
   */
  _patterns: [
    // ---- 中文陷阱题 ----
    { pattern: /请\s*选择\s*[第|选项]*\s*[A-Da-d一二三四五六七八九\d]/i, severity: 'high', desc: '指定选项题' },
    { pattern: /此题\s*(请选|必须选|请选择)/, severity: 'high', desc: '指定选项题' },
    { pattern: /请\s*(点击|勾选|选择)\s*["""「'].*?[""」']/, severity: 'high', desc: '指定选项题' },
    { pattern: /这是\s*(一道)?\s*(注意力|陷阱|检测|测试)题/, severity: 'high', desc: '注意力检测' },
    { pattern: /不要\s*(选|选择|填|回答)/, severity: 'high', desc: '反向指令题' },
    { pattern: /请\s*(不要|勿)\s*(选|选择|填)/, severity: 'high', desc: '反向指令题' },
    { pattern: /此\s*题为\s*检测\s*题/, severity: 'high', desc: '检测题' },
    { pattern: /为了\s*确保\s*(您)?\s*(认真|仔细).*(阅读|填写)/, severity: 'medium', desc: '认真阅读提醒' },
    { pattern: /如果您\s*(认真|正在)\s*(阅读|看)/, severity: 'high', desc: '认真阅读检测' },
    { pattern: /请\s*忽略\s*(此题|本题|这个)/, severity: 'high', desc: '忽略指令题' },
    { pattern: /选\s*[""「'](.{1,10})[""」']/, severity: 'high', desc: '指定内容题' },
    { pattern: /本题\s*(请)?\s*选\s*[A-Da-d]/, severity: 'high', desc: '指定选项题' },

    // ---- 英文陷阱题 ----
    { pattern: /this\s+is\s+(an?\s+)?attention\s+check/i, severity: 'high', desc: '注意力检测' },
    { pattern: /please\s+select\s+[""'].*?[""']/i, severity: 'high', desc: '指定选项' },
    { pattern: /please\s+choose\s+[""'].*?[""']/i, severity: 'high', desc: '指定选项' },
    { pattern: /do\s+not\s+(select|choose|answer|pick)/i, severity: 'high', desc: '反向指令' },
    { pattern: /if\s+you\s+(are|you're)\s+(reading|paying\s+attention)/i, severity: 'high', desc: '认真阅读检测' },
    { pattern: /select\s+(option\s+)?[A-Da-d]/i, severity: 'high', desc: '指定选项' },
    { pattern: /trap\s+question/i, severity: 'high', desc: '陷阱题' },
    { pattern: /catch\s+trial/i, severity: 'medium', desc: '捕获试验' },
  ],

  /**
   * 矛盾检测规则
   * 如果选了前面的某个选项，后面的题不应该选某些选项
   */
  _contradictionRules: [
    { prevPattern: /从不|没有|无|none|never/i, nextPattern: /每天|经常|总是|every.?day|always/i, desc: '前后矛盾' },
    { prevPattern: /不吸烟|不抽烟|non.?smok/i, nextPattern: /每天.*(根|支|包|烟)/i, desc: '吸烟矛盾' },
    { prevPattern: /不喝酒|不饮酒/i, nextPattern: /每天.*(瓶|杯|酒)/i, desc: '饮酒矛盾' },
    { prevPattern: /无|没有|none/i, nextPattern: /哪个品牌|什么品牌|which brand/i, desc: '品牌矛盾' },
    { prevPattern: /0\s*[岁年]|无子女|没有孩子/i, nextPattern: /孩子.*(年龄|几岁|多大)/i, desc: '子女矛盾' },
  ],

  /**
   * 初始化
   */
  async init(adapter) {
    this._adapter = adapter;
    const toggles = await Storage.getToggles();
    this._enabled = toggles.attention;

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && 'attentionEnabled' in changes) {
        this._enabled = changes.attentionEnabled.newValue;
        if (this._enabled) {
          this.scanAll();
        } else {
          this.clearAll();
        }
      }
    });

    this.scanAll();
    this._observeDOM();
  },

  /**
   * 扫描所有题目，高亮陷阱题
   */
  scanAll() {
    if (!this._enabled) return;

    const questions = this._adapter.getQuestions();
    questions.forEach(q => this._scanQuestion(q));
  },

  /**
   * 扫描单个题目
   */
  _scanQuestion(questionEl) {
    if (this._warnedQuestions.has(questionEl)) return;

    const text = this._adapter.getQuestionText(questionEl);
    if (!text || text.length < 3) return;

    for (const rule of this._patterns) {
      if (rule.pattern.test(text)) {
        this._warnedQuestions.add(questionEl);
        this._highlightQuestion(questionEl, rule);
        return; // 只匹配第一个
      }
    }

    // 也检查选项文本
    const options = this._adapter.getOptions(questionEl);
    const optionTexts = options.map(o => o.text).join(' ');
    for (const rule of this._patterns) {
      if (rule.pattern.test(optionTexts)) {
        this._warnedQuestions.add(questionEl);
        this._highlightQuestion(questionEl, rule);
        return;
      }
    }
  },

  /**
   * 高亮题目
   */
  _highlightQuestion(questionEl, rule) {
    questionEl.classList.add('wj-attention-warn');

    // 添加警告标签
    const badge = document.createElement('span');
    badge.className = 'wj-attention-badge';
    badge.textContent = `⚠ ${rule.desc}`;
    badge.title = '此题可能是注意力检测/陷阱题，请仔细阅读题干后再作答';
    questionEl.appendChild(badge);
  },

  /**
   * 清除所有高亮
   */
  clearAll() {
    document.querySelectorAll('.wj-attention-warn').forEach(el => {
      el.classList.remove('wj-attention-warn');
    });
    document.querySelectorAll('.wj-attention-badge').forEach(el => {
      el.remove();
    });
    this._warnedQuestions = new WeakSet();
  },

  /**
   * 记录用户选择，用于矛盾检测
   */
  recordAnswer(questionText, selectedText) {
    this._answerHistory.push({
      question: questionText,
      answer: selectedText,
      time: Date.now()
    });

    // 保留最近 50 条
    if (this._answerHistory.length > 50) {
      this._answerHistory.shift();
    }

    // 检查矛盾
    this._checkContradiction(questionText, selectedText);
  },

  /**
   * 矛盾检测
   */
  _checkContradiction(currentQuestion, currentAnswer) {
    for (const rule of this._contradictionRules) {
      for (const prev of this._answerHistory.slice(0, -1)) {
        if (rule.prevPattern.test(prev.answer) && rule.nextPattern.test(currentAnswer)) {
          // 找到矛盾！在当前题目上添加提示
          const questions = this._adapter.getQuestions();
          for (const q of questions) {
            const text = this._adapter.getQuestionText(q);
            if (text === currentQuestion || q.textContent.includes(currentQuestion)) {
              this._showContradictionHint(q, prev, rule);
              break;
            }
          }
          return;
        }
      }
    }
  },

  /**
   * 显示矛盾提示
   */
  _showContradictionHint(questionEl, prevAnswer, rule) {
    // 避免重复添加
    if (questionEl.querySelector('.wj-contradiction-hint')) return;

    const hint = document.createElement('span');
    hint.className = 'wj-contradiction-hint';
    hint.textContent = `⚠ ${rule.desc}：之前选了"${prevAnswer.answer.substring(0, 15)}"`;
    hint.title = '前后回答可能不一致，请检查';
    questionEl.appendChild(hint);
  },

  /**
   * 监听 DOM 变化，新题自动扫描
   */
  _observeDOM() {
    const observer = new MutationObserver(() => {
      clearTimeout(this._scanTimer);
      this._scanTimer = setTimeout(() => {
        this.scanAll();
      }, 800);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
};
