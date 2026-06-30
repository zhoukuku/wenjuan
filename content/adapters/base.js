// 问卷助手 - 通用适配器
// 基于语义 HTML 推测题目结构，适配未知问卷平台

const BaseAdapter = {
  name: '通用适配器',
  domain: '*',
  version: '2.0',

  /**
   * 判断当前页面是否是问卷页面
   * 启发式：存在多个 radio/checkbox 组合，或包含问卷相关关键词
   */
  isSurvey() {
    const inputs = document.querySelectorAll('input[type="radio"], input[type="checkbox"]');
    // 有多个选项输入，大概率是问卷
    if (inputs.length >= 2) return true;

    // 检查 URL 特征
    const url = window.location.href.toLowerCase();
    const urlKeywords = ['survey', 'interview', 'questionnaire', 'poll', 'diaocha', 'wenjuan', 'vote'];
    if (urlKeywords.some(k => url.includes(k))) return true;

    // 检查是否包含问卷关键词
    const bodyText = (document.body.innerText || '').toLowerCase();
    const zhKeywords = ['问卷', '调查', '请选择', '单选题', '多选题', '请填写', '请回答'];
    const enKeywords = ['survey', 'questionnaire', 'please select', 'please choose',
      'strongly agree', 'strongly disagree', 'multiple choice', 'single choice',
      'please rate', 'on a scale'];
    const allKeywords = [...zhKeywords, ...enKeywords];
    const matchCount = allKeywords.filter(k => bodyText.includes(k.toLowerCase())).length;
    return matchCount >= 1;
  },

  /**
   * 获取所有题目容器
   * 返回 NodeList/Array of DOM elements
   */
  getQuestions() {
    // 尝试多种常见选择器
    const selectors = [
      // 问卷星/常见平台特征
      '.field, .question, .survey-question',
      '[class*="question"]',
      '[class*="field-item"]',
      'fieldset',
      '.ui-field-contain',
      // 纯 div 结构（通过语义 class 匹配）
      'div[class*="topic"], div[class*="subject"]',
      // 带有题号的元素
      'div[id*="q_"], div[id*="question"], div[id*="topic"]',
      // React SPA 常见模式
      '[class*="Question"]',
      '[class*="answer-list"]',
      '[class*="options-list"]',
      '[role="radiogroup"]',
      // data 属性
      '[data-question-id]',
      '[data-testid*="question"]'
    ];

    for (const sel of selectors) {
      try {
        const nodes = document.querySelectorAll(sel);
        if (nodes.length >= 1) return Array.from(nodes);
      } catch (_) { /* invalid selector */ }
    }

    // 回退：查找包含 radio/checkbox 的父容器
    const inputs = document.querySelectorAll('input[type="radio"], input[type="checkbox"]');
    const containers = new Set();
    inputs.forEach(input => {
      const container = this._findQuestionContainer(input);
      if (container) containers.add(container);
    });

    // 如果通过选项回溯找到了多个容器，按 DOM 顺序排列
    if (containers.size >= 1) {
      const sorted = Array.from(containers);
      // 尝试按 DOM 顺序排序
      try {
        sorted.sort((a, b) => {
          const pos = a.compareDocumentPosition(b);
          return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        });
      } catch (_) {}
      return sorted;
    }

    return [];
  },

  /**
   * 从输入元素向上查找题目容器
   */
  _findQuestionContainer(el) {
    let current = el.parentElement;
    let depth = 0;
    while (current && depth < 8) {
      const cls = current.className || '';
      const id = current.id || '';
      const tag = current.tagName.toLowerCase();
      if (tag === 'fieldset') return current;
      if (/(question|field|topic|subject|item|row)/i.test(cls + id)) return current;
      // 如果包含多个 input，可能是选项容器，再往上一层
      const inputs = current.querySelectorAll('input[type="radio"], input[type="checkbox"]');
      if (inputs.length >= 2 && depth > 1) return current.parentElement;
      current = current.parentElement;
      depth++;
    }
    return el.closest('fieldset, .field, [class*="question"], [class*="item"]') || el.parentElement;
  },

  /**
   * 获取题目文本
   */
  getQuestionText(questionEl) {
    // 尝试找到题目标题
    const titleSelectors = [
      '.field-label', '.question-title', '.topic-title',
      'legend', 'h4', 'h5', '.title', '[class*="title"]',
      'label:first-child', 'span:first-child'
    ];
    for (const sel of titleSelectors) {
      const el = questionEl.querySelector(sel);
      if (el && el.textContent.trim().length > 2) {
        return el.textContent.trim();
      }
    }
    // 取元素自身的文本（排除子元素中选项的文本）
    const clone = questionEl.cloneNode(true);
    clone.querySelectorAll('input, select, textarea, .option, [class*="option"]').forEach(e => e.remove());
    const text = clone.textContent.trim();
    return text.length > 2 ? text : '';
  },

  /**
   * 获取题目的所有选项
   * 返回 { el, text, type: 'radio'|'checkbox'|'select'|'text' }[]
   */
  getOptions(questionEl) {
    const options = [];

    // radio / checkbox
    const inputs = questionEl.querySelectorAll('input[type="radio"], input[type="checkbox"]');
    inputs.forEach(input => {
      const label = this._findLabel(input);
      options.push({
        el: input,
        text: label ? label.textContent.trim() : (input.value || ''),
        type: input.type,
        index: options.length
      });
    });

    // select
    const selects = questionEl.querySelectorAll('select');
    selects.forEach(select => {
      Array.from(select.options).forEach((opt, i) => {
        if (opt.value) {
          options.push({
            el: select,
            text: opt.textContent.trim(),
            type: 'select-option',
            index: i,
            value: opt.value
          });
        }
      });
    });

    // text inputs / textarea
    const textInputs = questionEl.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="number"], textarea, input:not([type])');
    textInputs.forEach(input => {
      if (input.type === 'radio' || input.type === 'checkbox') return;
      if (input.type === 'hidden') return;
      options.push({
        el: input,
        text: input.placeholder || input.name || '输入框',
        type: 'text'
      });
    });

    return options;
  },

  /**
   * 查找 input 关联的 label
   */
  _findLabel(input) {
    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) return label;
    }
    return input.closest('label');
  },

  /**
   * 获取"下一页"/"提交"按钮
   */
  getNextButton() {
    const selectors = [
      '#next, #submit, #ctlNext, #submit_button',
      '.submitbtn, .next-btn, .btn-next, .btn-submit',
      'button[type="submit"]',
      'input[type="submit"]',
      '[class*="next"], [class*="submit"], [class*="continue"]',
      '.ant-btn-primary', '.el-button--primary',
      'button[class*="primary"]', '[data-testid*="next"]'
    ];
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el && this._isVisible(el)) return el;
      } catch (_) {}
    }

    // 文本匹配（中英文）
    const buttons = document.querySelectorAll('button, a, input[type="button"], input[type="submit"], .btn, [role="button"]');
    const nextPatterns = /^(下一|提交|继续|确认|完成|next|submit|continue|done|ok|finish|send)$/i;
    for (const btn of buttons) {
      const text = (btn.textContent || btn.value || '').trim();
      if (nextPatterns.test(text) && this._isVisible(btn)) return btn;
    }
    return null;
  },

  /**
   * 获取"上一页"按钮
   */
  getPrevButton() {
    const buttons = document.querySelectorAll('button, a, input[type="button"], .btn, [role="button"]');
    for (const btn of buttons) {
      const text = (btn.textContent || btn.value || '').trim();
      if (/^(上一|返回|上一步|后退|back|prev)/i.test(text)) {
        if (this._isVisible(btn)) return btn;
      }
    }
    return null;
  },

  /**
   * 获取进度信息
   * 返回 { current, total } 或 null
   */
  getProgress() {
    // 尝试从页面提取进度
    const progressPatterns = [
      /(\d+)\s*\/\s*(\d+)/,       // "3 / 20"
      /第\s*(\d+)\s*页.*共\s*(\d+)\s*页/,  // "第3页 共20页"
      /(\d+)%\s*完成/,              // "30% 完成"
      /进度[：:]\s*(\d+)\/(\d+)/,
    ];

    const bodyText = document.body.innerText || '';
    for (const pattern of progressPatterns) {
      const match = bodyText.match(pattern);
      if (match) {
        if (match[0].includes('%')) {
          return { current: parseInt(match[1]), total: 100, isPercentage: true };
        }
        return { current: parseInt(match[1]), total: parseInt(match[2]) };
      }
    }

    // 尝试找页面自带的进度条
    const progressBar = document.querySelector('[class*="progress"], [class*="process"], .progress-bar');
    if (progressBar) {
      const style = progressBar.style.width || progressBar.getAttribute('style') || '';
      const pctMatch = style.match(/(\d+)%/);
      if (pctMatch) return { current: parseInt(pctMatch[1]), total: 100, isPercentage: true };
    }

    return null;
  },

  /**
   * 判断题目是否已完成（已选择/填写）
   */
  isQuestionAnswered(questionEl) {
    const options = this.getOptions(questionEl);
    if (options.length === 0) return true; // 无选项视为已完成

    const hasRadio = options.some(o => o.type === 'radio');
    const hasCheckbox = options.some(o => o.type === 'checkbox');
    const hasText = options.some(o => o.type === 'text');

    // radio: 至少选中一个
    if (hasRadio) {
      const checked = options.some(o => o.type === 'radio' && o.el.checked);
      if (!checked) return false;
    }

    // checkbox: 至少选中一个
    if (hasCheckbox) {
      const checked = options.some(o => o.type === 'checkbox' && o.el.checked);
      if (!checked) return false;
    }

    // text: 至少有一个非空
    if (hasText) {
      const filled = options.some(o => o.type === 'text' && o.el.value.trim().length > 0);
      if (!filled) return false;
    }

    return true;
  },

  /**
   * 元素是否可见
   */
  _isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  },

  /**
   * 滚动题目到视野中央
   */
  scrollToQuestion(questionEl) {
    questionEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
};
