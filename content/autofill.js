// 问卷助手 - 一键填充 + 选项分级标记模块
// 参考 FormFully / Google Form Auto Filler 的设计模式

const Autofill = {
  _enabled: true,
  _adapter: null,
  _filledCount: 0,
  _gradedEls: [],
  _history: [],       // 填充历史 [{questionEl, optionEl, prevState}]
  _lastBatch: null,   // 上一次批量填充的快照

  async init(adapter) {
    this._adapter = adapter;

    // 监听来自 popup 的消息
    this._msgListener = (msg, sender, sendResponse) => {
      if (msg.type === 'autofillAll') {
        this.fillAll().then(count => sendResponse({ filled: count })).catch(() => sendResponse({ filled: 0 }));
        return true;
      }
      if (msg.type === 'gradeOptions') {
        this.gradeAllOptions();
        sendResponse({ ok: true });
      }
      if (msg.type === 'clearGrades') {
        this.clearGrades();
        sendResponse({ ok: true });
      }
      if (msg.type === 'undoFill') {
        sendResponse({ undone: this.undo() });
      }
      if (msg.type === 'startAutoPilot') {
        this.startAutoPilot(msg.speed || 'normal');
        sendResponse({ ok: true });
      }
      if (msg.type === 'stopAutoPilot') {
        this.stopAutoPilot();
        sendResponse({ ok: true });
      }
      if (msg.type === 'getAutoPilotStatus') {
        sendResponse({ running: this._autoPilot.running, done: this._autoPilot.totalDone, page: this._autoPilot.pageCount });
      }
    };
    chrome.runtime.onMessage.addListener(this._msgListener);

    // 快捷键
    this._keyListener = (e) => {
      // Alt+Shift+F = 一键填充
      if (e.altKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        this.fillAll();
      }
      // Ctrl+Shift+A = 自动答题
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        if (this._autoPilot.running) {
          this.stopAutoPilot();
        } else {
          this.startAutoPilot('normal');
        }
      }
      // Alt+G = 分级标记
      if (e.altKey && !e.shiftKey && e.key === 'g') {
        e.preventDefault();
        this.gradeAllOptions();
      }
      // Ctrl+Z = 撤销（仅在有历史时拦截）
      if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
        if (this._history.length > 0) {
          e.preventDefault();
          const undone = this.undo();
          if (undone > 0) this._showToast(`↩ 已撤销 ${undone} 道题`);
        }
      }
      // Esc = 停止自动答题
      if (e.key === 'Escape' && this._autoPilot.running) {
        e.preventDefault();
        this.stopAutoPilot();
      }
    };
    document.addEventListener('keydown', this._keyListener, true);
  },

  /**
   * 一键填充当前页面所有题目
   * 返回填充的题目数量
   */
  async fillAll() {
    const questions = this._adapter.getQuestions();
    const batch = [];
    let count = 0;

    for (const q of questions) {
      if (this._adapter.isQuestionAnswered(q)) continue;

      const qText = this._adapter.getQuestionText(q);
      if (!qText) continue;

      let suggestion = null;

      if (typeof Suggest !== 'undefined' && Suggest._findSuggestion) {
        suggestion = await Suggest._findSuggestion(qText, q);
      }

      if (!suggestion) {
        const opts = this._adapter.getOptions(q);
        const radioOpts = opts.filter(o => o.type === 'radio');
        if (radioOpts.length >= 2) {
          const mid = Math.floor(radioOpts.length / 2);
          suggestion = { text: radioOpts[mid].text, optionEl: radioOpts[mid].el, clickEl: radioOpts[mid].clickEl || null };
        }
      }

      if (suggestion) {
        batch.push({
          questionEl: q,
          optionEl: suggestion.optionEl,
          clickEl: suggestion.clickEl,
          prevChecked: suggestion.optionEl ? suggestion.optionEl.checked : false,
          text: suggestion.text
        });
        this._applySuggestion(suggestion, q);
        count++;
      }
    }

    if (batch.length > 0) {
      this._lastBatch = batch;
      this._history.push(batch);
      if (this._history.length > 20) this._history.shift(); // 限制历史
    }

    this._filledCount += count;
    this._showToast(`✅ 已填充 ${count} 道题 | Ctrl+Z 撤销`);
    return count;
  },

  /** 撤销上一次批量填充 */
  undo() {
    const batch = this._history.pop();
    if (!batch) return 0;

    let count = 0;
    batch.forEach(record => {
      if (record.clickEl) {
        // 重新点击以取消(Nfield等框架)
        // 对于 radio，已选中后无法直接取消，需要找到取消/清除按钮
        // 简化处理：尝试 uncheck
        if (record.optionEl && record.optionEl.type === 'radio') {
          record.optionEl.checked = record.prevChecked;
          record.optionEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (record.optionEl && record.optionEl.type === 'checkbox') {
          record.optionEl.checked = record.prevChecked;
          record.optionEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
        count++;
      }
    });
    this._lastBatch = null;
    return count;
  },

  /**
   * 给所有题目的选项做分级标记
   * 🟢 推荐  🟡 可接受  🔴 不推荐
   */
  gradeAllOptions() {
    this.clearGrades();
    const questions = this._adapter.getQuestions();

    questions.forEach(q => {
      const qText = this._adapter.getQuestionText(q);
      if (!qText || this._adapter.isQuestionAnswered(q)) return;

      const opts = this._adapter.getOptions(q);
      const radioOpts = opts.filter(o => o.type === 'radio');
      if (radioOpts.length < 2) return;

      // 找到最佳推荐
      let bestIdx = -1;
      if (typeof Suggest !== 'undefined' && Suggest._findSuggestion) {
        const sug = Suggest._findSuggestion(qText, q);
        if (sug) {
          bestIdx = radioOpts.findIndex(o => o.text === sug.text || o.el === sug.optionEl);
        }
      }

      radioOpts.forEach((opt, i) => {
        const container = opt.clickEl || opt.el.closest('li') || opt.el.closest('div[class]') || opt.el.parentElement;
        if (!container) return;

        let grade;
        if (i === bestIdx) {
          grade = 'best'; // 🟢 最佳推荐
        } else if (opt.text.match(/不知道|不确定|一般|中等|适中|没意见|中性/)) {
          grade = 'ok'; // 🟡 中性安全
        } else if (opt.text.match(/非常不|完全不|绝对不|极不|非常差/)) {
          grade = 'worst'; // 🔴 极端负面
        } else if (opt.text.match(/非常|完全|绝对|极|非常好|非常满意/)) {
          grade = 'extreme'; // 🟠 极端正面
        } else {
          grade = 'normal'; // ⚪ 普通
        }

        const cls = `wj-grade wj-grade-${grade}`;
        container.classList.add(cls);
        container.dataset.wjGrade = grade;
        this._gradedEls.push(container);
      });
    });

    // 确保样式注入
    if (!document.getElementById('wj-grade-styles')) {
      const st = document.createElement('style');
      st.id = 'wj-grade-styles';
      st.textContent = `
        .wj-grade-best { outline: 3px solid #4caf50 !important; outline-offset: 2px; box-shadow: 0 0 8px rgba(76,175,80,0.4); border-radius: 4px; position: relative; }
        .wj-grade-ok { outline: 2px dashed #ff9800; outline-offset: 2px; opacity: 0.85; }
        .wj-grade-worst { outline: 2px solid #f44336; outline-offset: 2px; opacity: 0.7; }
        .wj-grade-extreme { outline: 2px dashed #ff5722; outline-offset: 2px; opacity: 0.75; }
        .wj-grade-normal { opacity: 0.8; }
        .wj-grade-best::after { content: '👍'; position: absolute; right: 4px; top: 50%; transform: translateY(-50%); font-size: 16px; pointer-events: none; }
      `;
      document.head.appendChild(st);
    }
  },

  clearGrades() {
    this._gradedEls.forEach(el => {
      el.classList.remove('wj-grade', 'wj-grade-best', 'wj-grade-ok', 'wj-grade-worst', 'wj-grade-extreme', 'wj-grade-normal');
      delete el.dataset.wjGrade;
    });
    this._gradedEls = [];
  },

  _applySuggestion(s, questionEl) {
    if (s.clickEl) {
      s.clickEl.click();
    } else if (s.optionEl) {
      s.optionEl.checked = true;
      s.optionEl.dispatchEvent(new Event('change', { bubbles: true }));
      s.optionEl.dispatchEvent(new Event('click', { bubbles: true }));
    } else {
      const inputs = questionEl.querySelectorAll('input[type="text"],input[type="email"],input[type="tel"],input[type="number"],textarea,input:not([type])');
      for (const inp of inputs) {
        if (['radio','checkbox','hidden','submit','button'].includes(inp.type)) continue;
        const proto = inp.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(inp, s.text);
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
    }
  },

  _showToast(msg) {
    let toast = document.getElementById('wj-toast');
    if (!toast) { toast = document.createElement('div'); toast.id = 'wj-toast'; document.body.appendChild(toast); }
    toast.textContent = msg;
    toast.classList.add('wj-visible');
    clearTimeout(this._tId);
    this._tId = setTimeout(() => toast.classList.remove('wj-visible'), 2000);
  },

  // ========================
  // 自动答题模式 (Auto-Pilot)
  // ========================
  _autoPilot: {
    running: false,
    speed: 'normal',     // fast(3-5s) / normal(5-10s) / slow(10-20s)
    stopRequested: false,
    timerId: null,
    totalDone: 0,
    pageCount: 0
  },

  /** 启动自动答题 */
  startAutoPilot(speed) {
    if (this._autoPilot.running) return;
    this._autoPilot.running = true;
    this._autoPilot.stopRequested = false;
    this._autoPilot.speed = speed || 'normal';
    this._autoPilot.totalDone = 0;
    this._autoPilot.pageCount = 0;

    this._showToast('🤖 自动答题已启动 | 按 Esc 停止');
    this._autoPilotLoop();
  },

  /** 停止自动答题 */
  stopAutoPilot() {
    this._autoPilot.stopRequested = true;
    this._autoPilot.running = false;
    clearTimeout(this._autoPilot.timerId);
    this._showToast(`⏹ 已停止 | 本页完成 ${this._autoPilot.totalDone} 题`);
  },

  /** 自动答题主循环 */
  async _autoPilotLoop() {
    if (this._autoPilot.stopRequested) {
      this._autoPilot.running = false;
      return;
    }

    const questions = this._adapter.getQuestions();
    if (!questions.length) {
      // 最后一页，尝试提交
      const submitBtn = this._adapter.getNextButton();
      if (submitBtn) {
        this._showToast('📤 最后一页，提交中...');
        submitBtn.click();
      }
      this._autoPilot.running = false;
      return;
    }

    let pageFilled = 0;

    for (const q of questions) {
      if (this._autoPilot.stopRequested) break;
      if (this._adapter.isQuestionAnswered(q)) continue;

      const qText = this._adapter.getQuestionText(q);
      if (!qText) continue;

      // 找推荐
      let suggestion = null;
      if (typeof Suggest !== 'undefined' && Suggest._findSuggestion) {
        try {
          suggestion = await Suggest._findSuggestion(qText, q);
        } catch (_) {}
      }

      if (!suggestion) {
        const opts = this._adapter.getOptions(q);
        const radioOpts = opts.filter(o => o.type === 'radio');
        const checkOpts = opts.filter(o => o.type === 'checkbox');
        const targetOpts = radioOpts.length > 0 ? radioOpts : checkOpts;

        if (targetOpts.length >= 2) {
          const mid = Math.floor(targetOpts.length / 2);
          suggestion = { text: targetOpts[mid].text, optionEl: targetOpts[mid].el, clickEl: targetOpts[mid].clickEl || null };
        }
      }

      if (!suggestion) continue;

      // 检测题型
      const opts = this._adapter.getOptions(q);
      const hasRadio = opts.some(o => o.type === 'radio');
      const hasCheck = opts.some(o => o.type === 'checkbox');

      // 高亮推荐选项
      if (typeof Suggest !== 'undefined' && Suggest._addOutline) {
        Suggest._addOutline(suggestion);
      }
      this._adapter.scrollToQuestion(q);

      // 随机延迟
      const delay = this._getAutoDelay();
      const ms = delay * 1000;
      this._showToast(`⏳ ${delay}秒后选择「${suggestion.text.substring(0, 20)}」...`);

      const waited = await this._waitOrStop(ms);
      if (!waited) return; // 被 Esc 中断

      // 点击
      if (hasCheck) {
        // 多选题：只勾第一个推荐
        this._applySuggestion(suggestion, q);
      } else {
        // 单选题
        this._applySuggestion(suggestion, q);
      }

      this._autoPilot.totalDone++;
      pageFilled++;

      const typeLabel = hasCheck ? '多选' : '单选';
      this._showToast(`✅ [${typeLabel}] ${this._autoPilot.totalDone}题 | «${suggestion.text.substring(0, 15)}»`);

      // 短暂停顿
      await this._waitOrStop(800);
      if (this._autoPilot.stopRequested) return;
    }

    // 翻页
    if (pageFilled > 0 || questions.every(q => this._adapter.isQuestionAnswered(q))) {
      this._autoPilot.pageCount++;
      this._showToast(`📄 第${this._autoPilot.pageCount}页完成，翻页中...`);
      await this._waitOrStop(2000);

      const nextBtn = this._adapter.getNextButton();
      if (nextBtn && !this._autoPilot.stopRequested) {
        nextBtn.click();
        this._showToast('⏳ 等待下一页加载...');
        // 等新页面渲染
        await this._waitOrStop(3000);
        // 递归处理下一页
        if (!this._autoPilot.stopRequested) {
          setTimeout(() => this._autoPilotLoop(), 2000);
        }
      } else {
        this._showToast('✅ 问卷已完成！');
        this._autoPilot.running = false;
      }
    } else {
      this._autoPilot.running = false;
    }
  },

  /** 获取随机延迟秒数 */
  _getAutoDelay() {
    switch (this._autoPilot.speed) {
      case 'fast': return 3 + Math.floor(Math.random() * 3);     // 3-5s
      case 'slow': return 10 + Math.floor(Math.random() * 11);   // 10-20s
      default: return 5 + Math.floor(Math.random() * 6);         // 5-10s (normal)
    }
  },

  /** 等待指定毫秒，如果用户停止则提前返回 false */
  _waitOrStop(ms) {
    return new Promise(resolve => {
      const start = Date.now();
      const check = () => {
        if (this._autoPilot.stopRequested) {
          this._autoPilot.running = false;
          resolve(false);
          return;
        }
        if (Date.now() - start >= ms) {
          resolve(true);
          return;
        }
        this._autoPilot.timerId = setTimeout(check, 200);
      };
      check();
    });
  }
};
