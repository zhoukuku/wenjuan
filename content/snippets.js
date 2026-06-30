// 问卷助手 - 快速填片模块
// 管理预存常用信息，通过快捷键快速填入输入框

const Snippets = {
  // 浮动面板 DOM
  _panel: null,
  _overlay: null,
  _snippets: [],
  _targetInput: null,

  /**
   * 初始化
   */
  async init() {
    this._snippets = await Storage.getSnippets();
    this._createPanel();
    this._bindEvents();
  },

  /**
   * 创建浮动面板 DOM
   */
  _createPanel() {
    // 遮罩（点击关闭）
    this._overlay = document.createElement('div');
    this._overlay.id = 'wj-snippet-overlay';
    this._overlay.addEventListener('click', () => this.hide());
    document.body.appendChild(this._overlay);

    // 面板
    this._panel = document.createElement('div');
    this._panel.id = 'wj-snippet-panel';
    this._panel.style.display = 'none';
    document.body.appendChild(this._panel);
  },

  /**
   * 绑定事件
   */
  _bindEvents() {
    // 监听来自 popup 的设置更新
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.snippets) {
        this._snippets = changes.snippets.newValue || [];
      }
    });

    // 键盘事件在 Keyboard 模块中统一处理，这里只暴露方法
  },

  /**
   * 显示片段选择面板
   * @param {HTMLElement} targetInput - 要填入的目标输入框
   */
  show(targetInput) {
    if (!this._snippets.length) {
      this._showToast('暂无保存的片段，请在设置中添加');
      return;
    }

    this._targetInput = targetInput;
    this._renderPanel();

    // 定位在目标输入框附近
    const rect = targetInput.getBoundingClientRect();
    let top = rect.bottom + 6;
    let left = rect.left;

    // 防止溢出屏幕
    if (top + 300 > window.innerHeight) {
      top = rect.top - 310;
    }
    if (left + 240 > window.innerWidth) {
      left = window.innerWidth - 250;
    }
    if (left < 10) left = 10;
    if (top < 10) top = 10;

    this._panel.style.top = top + 'px';
    this._panel.style.left = left + 'px';
    this._panel.style.display = 'block';
    this._overlay.style.display = 'block';

    // 高亮第一个选项
    const firstItem = this._panel.querySelector('.wj-snippet-item');
    if (firstItem) firstItem.classList.add('wj-snippet-active');
  },

  /**
   * 隐藏面板
   */
  hide() {
    this._panel.style.display = 'none';
    this._overlay.style.display = 'none';
    this._targetInput = null;
  },

  /**
   * 面板是否可见
   */
  isVisible() {
    return this._panel.style.display === 'block';
  },

  /**
   * 选择当前高亮的片段
   */
  selectHighlighted() {
    const active = this._panel.querySelector('.wj-snippet-item:hover') ||
                   this._panel.querySelector('.wj-snippet-active');
    if (active) {
      const index = parseInt(active.dataset.index);
      this._applySnippet(index);
    }
  },

  /**
   * 通过索引选择片段
   */
  selectByIndex(index) {
    if (index >= 0 && index < this._snippets.length) {
      this._applySnippet(index);
    }
  },

  /**
   * 应用片段到目标输入框
   */
  _applySnippet(index) {
    const snippet = this._snippets[index];
    if (!snippet || !this._targetInput) return;

    const value = snippet.value;
    if (!value) {
      this._showToast(`片段「${snippet.label}」未设置值`);
      this.hide();
      return;
    }

    // 填入值并触发 input/change 事件（兼容 React/Vue 表单）
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;
    nativeInputValueSetter.call(this._targetInput, value);
    this._targetInput.dispatchEvent(new Event('input', { bubbles: true }));
    this._targetInput.dispatchEvent(new Event('change', { bubbles: true }));

    // 对于 textarea
    if (this._targetInput.tagName === 'TEXTAREA') {
      const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      ).set;
      nativeTextareaSetter.call(this._targetInput, value);
      this._targetInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    this._showToast(`已填入「${snippet.label}」`);
    this.hide();
  },

  /**
   * 渲染片段列表
   */
  _renderPanel() {
    const htmls = this._snippets.map((s, i) => `
      <div class="wj-snippet-item" data-index="${i}">
        <span class="wj-snippet-num">${i + 1}</span>
        <span class="wj-snippet-label">${this._escape(s.label)}</span>
        <span class="wj-snippet-value">${this._escape(s.value || '(空)')}</span>
      </div>
    `);

    this._panel.innerHTML = `
      <div class="wj-snippet-title">选择要填入的内容（数字键选择）</div>
      ${htmls.join('')}
    `;

    // 点击事件
    this._panel.querySelectorAll('.wj-snippet-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        this._applySnippet(index);
      });
    });
  },

  /**
   * 获取当前聚焦输入框的合适片段
   */
  _guessSnippet(input) {
    const placeholder = (input.placeholder || '').toLowerCase();
    const name = (input.name || '').toLowerCase();
    const id = (input.id || '').toLowerCase();
    const hint = placeholder + name + id;

    const matches = this._snippets.filter(s => {
      const label = s.label.toLowerCase();
      return hint.includes(label) || label.includes(hint.split(/[\s,_-]+/)[0]);
    });

    return matches.length > 0 ? matches : this._snippets;
  },

  /**
   * Toast 提示
   */
  _showToast(message) {
    let toast = document.getElementById('wj-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'wj-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('wj-visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.remove('wj-visible');
    }, 1800);
  },

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};
