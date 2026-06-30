// 问卷助手 - 进度条模块
// 在页面顶部注入进度条，显示完成百分比和预计剩余时间

const Progress = {
  _enabled: true,
  _adapter: null,
  _wrap: null,
  _bar: null,
  _label: null,
  _startTime: 0,
  _questionTimes: [],  // 每道题的作答时间（秒）
  _lastQuestionCount: 0,
  _totalPages: null,
  _currentPage: 1,

  /**
   * 初始化
   */
  async init(adapter) {
    this._adapter = adapter;
    const toggles = await Storage.getToggles();
    this._enabled = toggles.progress;
    this._startTime = Date.now();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && 'progressEnabled' in changes) {
        this._enabled = changes.progressEnabled.newValue;
        if (this._enabled) {
          this._createUI();
          this.update();
        } else {
          this._removeUI();
        }
      }
    });

    if (this._enabled) {
      this._createUI();
      this.update();
      this._startTracking();
    }
  },

  /**
   * 创建进度条 UI
   */
  _createUI() {
    if (document.getElementById('wj-progress-bar-wrap')) return;

    // 进度条容器
    this._wrap = document.createElement('div');
    this._wrap.id = 'wj-progress-bar-wrap';

    this._bar = document.createElement('div');
    this._bar.id = 'wj-progress-bar-inner';
    this._wrap.appendChild(this._bar);

    document.body.appendChild(this._wrap);

    // 百分比标签
    this._label = document.createElement('div');
    this._label.id = 'wj-progress-label';
    document.body.appendChild(this._label);
  },

  /**
   * 移除进度条 UI
   */
  _removeUI() {
    if (this._wrap) this._wrap.remove();
    if (this._label) this._label.remove();
    this._wrap = null;
    this._bar = null;
    this._label = null;
  },

  /**
   * 更新进度条
   */
  update() {
    if (!this._enabled || !this._bar) return;

    // 尝试从平台获取进度
    const platformProgress = this._adapter.getProgress();
    let pct = 0;
    let detail = '';

    if (platformProgress) {
      if (platformProgress.isPercentage) {
        pct = Math.min(100, platformProgress.current);
        detail = `${platformProgress.current}%`;
      } else {
        pct = Math.min(100, Math.round((platformProgress.current / platformProgress.total) * 100));
        detail = `${platformProgress.current}/${platformProgress.total}`;
      }
    } else {
      // 根据已答题数 / 总题数估算
      const questions = this._adapter.getQuestions();
      const total = questions.length;
      if (total > 0) {
        let answered = 0;
        questions.forEach(q => {
          if (this._adapter.isQuestionAnswered(q)) answered++;
        });
        pct = Math.round((answered / total) * 100);

        // 限制在 5-95% 之间（留余量给未加载的题目）
        if (pct < 5 && answered > 0) pct = 5;
        if (pct > 95 && answered < total) pct = 95;

        detail = `${answered}/${total}`;
      }
    }

    // 更新进度条宽度
    this._bar.style.width = pct + '%';
    // 接近完成时变成金色
    if (pct >= 90) {
      this._bar.style.background = 'linear-gradient(90deg, #ff9800, #ffc107)';
    } else if (pct >= 50) {
      this._bar.style.background = 'linear-gradient(90deg, #2196f3, #4caf50)';
    } else {
      this._bar.style.background = 'linear-gradient(90deg, #4caf50, #8bc34a)';
    }

    // 更新标签
    const remaining = this._estimateRemaining();
    let labelText = `${pct}%`;
    if (detail) labelText += ` (${detail})`;
    if (remaining) labelText += ` · 预计剩余 ${remaining}`;
    this._label.textContent = labelText;
  },

  /**
   * 估算剩余时间
   */
  _estimateRemaining() {
    const avgTime = this._getAverageTime();
    if (avgTime <= 0) return null;

    const questions = this._adapter.getQuestions();
    const total = questions.length;
    let answered = 0;
    questions.forEach(q => {
      if (this._adapter.isQuestionAnswered(q)) answered++;
    });
    const remaining = total - answered;
    if (remaining <= 0) return null;

    const seconds = remaining * avgTime;
    if (seconds < 60) return `${seconds}秒`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}分钟`;
    return `${Math.floor(seconds / 3600)}h${Math.round((seconds % 3600) / 60)}m`;
  },

  /**
   * 获取平均每题用时
   */
  _getAverageTime() {
    if (this._questionTimes.length === 0) return 12; // 默认 12 秒

    // 去掉最快和最慢的 20%
    const sorted = [...this._questionTimes].sort((a, b) => a - b);
    const trimStart = Math.floor(sorted.length * 0.2);
    const trimEnd = Math.ceil(sorted.length * 0.2);
    const trimmed = sorted.slice(trimStart, sorted.length - trimEnd + 1);
    if (trimmed.length === 0) return sorted[Math.floor(sorted.length / 2)];

    return Math.round(trimmed.reduce((a, b) => a + b, 0) / trimmed.length);
  },

  /**
   * 开始追踪答题速度
   */
  _startTracking() {
    // 每分钟更新一次进度
    this._updateInterval = setInterval(() => {
      this.update();
    }, 3000);

    // 记录每次答题时间
    let lastChange = Date.now();
    const observer = new MutationObserver(() => {
      const now = Date.now();
      const questions = this._adapter.getQuestions();
      const answered = questions.filter(q => this._adapter.isQuestionAnswered(q)).length;

      if (answered !== this._lastQuestionCount) {
        const timeSpent = (now - lastChange) / 1000;
        if (timeSpent > 1 && timeSpent < 300) { // 忽略异常值
          this._questionTimes.push(timeSpent);
          // 保留最近 100 条
          if (this._questionTimes.length > 100) {
            this._questionTimes.shift();
          }
        }
        this._lastQuestionCount = answered;
        lastChange = now;
        this.update();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['checked', 'value']
    });
  }
};
