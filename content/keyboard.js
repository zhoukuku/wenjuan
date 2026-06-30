// 问卷助手 - 键盘快捷键模块
// 核心交互：数字键选择选项、Tab/Enter 翻页、Ctrl+Shift+F 快速填片

const Keyboard = {
  _enabled: true,
  _adapter: null,
  _questions: [],
  _currentIndex: 0,
  _pendingDigits: '',   // 两位数选择缓存
  _digitTimer: null,

  /**
   * 初始化键盘模块
   */
  async init(adapter) {
    this._adapter = adapter;
    const toggles = await Storage.getToggles();
    this._enabled = toggles.keyboard;

    // 监听设置变更
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && 'keyboardEnabled' in changes) {
        this._enabled = changes.keyboardEnabled.newValue;
      }
    });

    this._bindKeys();
    this._refreshQuestions();
    this._observeDOM();
  },

  /**
   * 绑定全局键盘事件
   */
  _bindKeys() {
    document.addEventListener('keydown', (e) => {
      if (!this._enabled) return;

      // 如果焦点在 input/textarea/select 中，不拦截（除非是 Tab 导航或片段快捷键）
      const tag = document.activeElement.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      const isContentEditable = document.activeElement.isContentEditable;

      // Ctrl+Shift+F：显示片段面板（始终可用）
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        if (isInput || isContentEditable) {
          Snippets.show(document.activeElement);
        } else {
          // 找当前题目中的第一个输入框
          const q = this._questions[this._currentIndex];
          if (q) {
            const inputs = q.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="number"], textarea, input:not([type])');
            const textInput = Array.from(inputs).find(inp =>
              !['radio', 'checkbox', 'hidden', 'submit', 'button'].includes(inp.type)
            );
            if (textInput) Snippets.show(textInput);
          }
        }
        return;
      }

      // 如果片段面板打开，数字键用于选择片段
      if (Snippets.isVisible()) {
        if (e.key >= '1' && e.key <= '9') {
          e.preventDefault();
          Snippets.selectByIndex(parseInt(e.key) - 1);
          return;
        }
        if (e.key === '0') {
          e.preventDefault();
          Snippets.selectByIndex(9); // 0 = 第10项
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          Snippets.hide();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          Snippets.selectHighlighted();
          return;
        }
        // 面板打开时忽略其他按键
        return;
      }

      // 如果在输入框中，不拦截常规按键（但拦截 Tab）
      if (isInput || isContentEditable) {
        if (e.key === 'Tab' && !e.shiftKey) {
          e.preventDefault();
          this._goNext();
        }
        return;
      }

      // ---- 问卷导航快捷键 ----
      switch (e.key) {
        case '1': case '2': case '3': case '4': case '5':
        case '6': case '7': case '8': case '9':
          e.preventDefault();
          this._handleDigitKey(parseInt(e.key));
          break;

        case '0':
          e.preventDefault();
          this._clearCurrentQuestion();
          break;

        case 'Tab':
          e.preventDefault();
          if (e.shiftKey) {
            this._goPrev();
          } else {
            this._goNext();
          }
          break;

        case 'Enter':
          e.preventDefault();
          this._goNext();
          break;

        case 'ArrowDown':
          e.preventDefault();
          this._moveToQuestion(1);
          break;

        case 'ArrowUp':
          e.preventDefault();
          this._moveToQuestion(-1);
          break;

        case 'j':
          e.preventDefault();
          this._moveToQuestion(1);
          break;

        case 'k':
          e.preventDefault();
          this._moveToQuestion(-1);
          break;
      }
    }, true); // capture phase to intercept before page handlers
  },

  /**
   * 处理数字键：选择对应选项
   * 支持两位数选择（1+2 = 选第12项）
   */
  _handleDigitKey(digit) {
    if (this._pendingDigits !== '') {
      // 第二个数字
      const index = parseInt(this._pendingDigits + digit) - 1;
      this._pendingDigits = '';
      clearTimeout(this._digitTimer);
      this._selectOption(index);
    } else if (digit === 0) {
      // 单独按0 = 清除
      this._clearCurrentQuestion();
    } else {
      // 第一个数字：等待 600ms 看是否有第二个数字
      this._pendingDigits = '' + digit;
      clearTimeout(this._digitTimer);
      this._digitTimer = setTimeout(() => {
        const index = parseInt(this._pendingDigits) - 1;
        this._pendingDigits = '';
        this._selectOption(index);
      }, 600);
    }
  },

  /**
   * 选择当前题目的第 index 个选项
   */
  _selectOption(index) {
    this._refreshQuestions();
    const question = this._questions[this._currentIndex];
    if (!question) return;

    const options = this._adapter.getOptions(question);
    if (index < 0 || index >= options.length) {
      this._showToast(`选项 ${index + 1} 不存在（共 ${options.length} 个选项）`);
      return;
    }

    const option = options[index];

    if (option.type === 'radio') {
      // 优先点击可点击元素（Nfield 等框架的 radio 是 display:none）
      if (option.clickEl) {
        option.clickEl.click();
      } else {
        option.el.checked = true;
        option.el.dispatchEvent(new Event('change', { bubbles: true }));
        option.el.dispatchEvent(new Event('click', { bubbles: true }));
      }
      // 单选后自动跳到下一题
      setTimeout(() => this._goNext(), 200);

    } else if (option.type === 'checkbox') {
      if (option.clickEl) {
        option.clickEl.click();
      } else {
        option.el.checked = !option.el.checked;
        option.el.dispatchEvent(new Event('change', { bubbles: true }));
        option.el.dispatchEvent(new Event('click', { bubbles: true }));
      }

    } else if (option.type === 'text') {
      option.el.focus();
      // 如果是输入框，自动显示片段面板
      setTimeout(() => Snippets.show(option.el), 100);

    } else if (option.type === 'select-option') {
      option.el.value = option.value;
      option.el.dispatchEvent(new Event('change', { bubbles: true }));
      setTimeout(() => this._goNext(), 200);
    }

    // 滚动到当前题目
    this._adapter.scrollToQuestion(question);
  },

  /**
   * 清除当前题目的所有选择
   */
  _clearCurrentQuestion() {
    const question = this._questions[this._currentIndex];
    if (!question) return;

    const inputs = question.querySelectorAll('input[type="radio"], input[type="checkbox"]');
    inputs.forEach(input => {
      input.checked = false;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const textInputs = question.querySelectorAll('input[type="text"], input[type="email"], textarea, input:not([type])');
    textInputs.forEach(input => {
      if (['radio', 'checkbox', 'hidden', 'submit', 'button'].includes(input.type)) return;
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    this._showToast('已清除选择');
  },

  /**
   * 下一题 / 下一页
   */
  _goNext() {
    this._refreshQuestions();
    if (this._currentIndex < this._questions.length - 1) {
      // 跳到下一题
      this._currentIndex++;
      this._highlightCurrent();
      this._adapter.scrollToQuestion(this._questions[this._currentIndex]);
    } else {
      // 最后一题，点击"下一页"按钮
      const nextBtn = this._adapter.getNextButton();
      if (nextBtn) {
        nextBtn.click();
        this._showToast('已翻到下一页');
        // 翻页后重置，等待 DOM 更新
        setTimeout(() => {
          this._refreshQuestions();
          this._currentIndex = 0;
          this._highlightCurrent();
        }, 800);
      } else {
        this._showToast('已经是最后一题');
      }
    }
  },

  /**
   * 上一题 / 上一页
   */
  _goPrev() {
    this._refreshQuestions();
    if (this._currentIndex > 0) {
      this._currentIndex--;
      this._highlightCurrent();
      this._adapter.scrollToQuestion(this._questions[this._currentIndex]);
    } else {
      const prevBtn = this._adapter.getPrevButton();
      if (prevBtn) {
        prevBtn.click();
        setTimeout(() => {
          this._refreshQuestions();
          this._currentIndex = this._questions.length - 1;
          this._highlightCurrent();
        }, 800);
      }
    }
  },

  /**
   * 移动当前题目焦点
   */
  _moveToQuestion(delta) {
    this._refreshQuestions();
    this._currentIndex = Math.max(0, Math.min(this._questions.length - 1, this._currentIndex + delta));
    this._highlightCurrent();
    this._adapter.scrollToQuestion(this._questions[this._currentIndex]);
  },

  /**
   * 高亮当前题目
   */
  _highlightCurrent() {
    this._questions.forEach((q, i) => {
      q.classList.remove('wj-question-active');
    });
    const current = this._questions[this._currentIndex];
    if (current) {
      current.classList.add('wj-question-active');
    }
  },

  /**
   * 刷新题目列表
   */
  _refreshQuestions() {
    this._questions = this._adapter.getQuestions();
    // 确保 currentIndex 不越界
    if (this._currentIndex >= this._questions.length) {
      this._currentIndex = Math.max(0, this._questions.length - 1);
    }
  },

  /**
   * 监听 DOM 变化（翻页/动态加载）
   */
  _observeDOM() {
    const observer = new MutationObserver(() => {
      // 防抖：500ms 内的多次变化合并为一次刷新
      clearTimeout(this._observeTimer);
      this._observeTimer = setTimeout(() => {
        const oldLength = this._questions.length;
        this._refreshQuestions();
        // 如果题目数量变化较大，重新高亮
        if (Math.abs(this._questions.length - oldLength) > 2) {
          this._currentIndex = 0;
          this._highlightCurrent();
        }
      }, 500);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  },

  /**
   * Toast 提示
   */
  _showToast(msg) {
    let toast = document.getElementById('wj-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'wj-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('wj-visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.remove('wj-visible');
    }, 1800);
  }
};
