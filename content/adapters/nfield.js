// 问卷助手 - Nfield 适配器 (nfieldcn.com / nfield.com)
// 基于真实 Nfield DOM 结构精准适配

const NfieldAdapter = {
  name: 'Nfield',
  domain: 'nfieldcn.com|nfield.com',

  isSurvey() {
    return !!document.querySelector('.segment.active, #activeCard, #progressBar');
  },

  /**
   * 获取题目：Nfield 每页一道题，在 div.segment.active 中
   */
  getQuestions() {
    // Nfield 单页单题模式
    const seg = document.querySelector('.segment.active');
    if (seg) return [seg];

    // 回退：查找所有 segment
    const all = document.querySelectorAll('.segment');
    if (all.length > 0) return Array.from(all);

    return BaseAdapter.getQuestions();
  },

  /**
   * 获取题目标题：span.h2 中的文本
   */
  getQuestionText(questionEl) {
    const h2 = questionEl.querySelector('span.h2, .h2');
    if (h2) {
      return h2.textContent.trim().replace(/^\w+\d+[\.\、\)）]\s*/, '');
    }
    return BaseAdapter.getQuestionText(questionEl);
  },

  /**
   * 获取选项：Nfield 的 radio 是 display:none，点击区域在父级 div.toggle.scale
   */
  getOptions(questionEl) {
    const options = [];

    // 查找所有 li.category.single
    const items = questionEl.querySelectorAll('li.category.single');
    items.forEach((li, i) => {
      const input = li.querySelector('input[type="radio"], input[type="checkbox"]');
      // 选项文本在 span.style-0 中
      const textEl = li.querySelector('span.style-0, span[class*="style-"]');
      const text = textEl ? textEl.textContent.trim() : (input ? input.value : '');

      if (input) {
        options.push({
          el: input,
          // 可点击区域是 div.toggle.scale
          clickEl: li.querySelector('.toggle.scale') || li.querySelector('.label-outer') || input,
          text: text,
          type: input.type,
          index: i
        });
      }
    });

    // 输入框
    const textInputs = questionEl.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="number"], textarea, input:not([type])'
    );
    textInputs.forEach(input => {
      if (['radio', 'checkbox', 'hidden', 'submit', 'button'].includes(input.type)) return;
      options.push({
        el: input,
        text: input.placeholder || input.name || '输入框',
        type: 'text'
      });
    });

    return options;
  },

  /**
   * 翻页按钮
   */
  getNextButton() {
    const btn = document.querySelector(
      'a.button-next, input.button-next, .button-next, #btnNext, [class*="next"]'
    );
    return btn && this._isVisible(btn) ? btn : null;
  },

  getPrevButton() {
    // Nfield 页面上通常有隐藏的上一页按钮
    const btn = document.querySelector(
      'a.button-prev, input.button-prev, .button-prev, #btnPrev, [data-back]'
    );
    // data-back 属性在 #interview-screen 上
    if (!btn) {
      const screen = document.getElementById('interview-screen');
      if (screen && screen.dataset.back) return screen;
    }
    return btn && this._isVisible(btn) ? btn : null;
  },

  /**
   * 进度条：div#progress 的 width 百分比
   */
  getProgress() {
    const progressEl = document.getElementById('progress');
    if (progressEl) {
      const w = progressEl.style.width || '';
      const pct = w.match(/(\d+)%/);
      if (pct) return { current: parseInt(pct[1]), total: 100, isPercentage: true };
    }
    return BaseAdapter.getProgress();
  },

  /**
   * 判断题目是否已答
   */
  isQuestionAnswered(questionEl) {
    const radios = questionEl.querySelectorAll('input[type="radio"]');
    if (radios.length > 0) {
      return Array.from(radios).some(r => r.checked);
    }
    const checkboxes = questionEl.querySelectorAll('input[type="checkbox"]');
    if (checkboxes.length > 0) {
      return Array.from(checkboxes).some(c => c.checked);
    }
    return BaseAdapter.isQuestionAnswered.call(this, questionEl);
  },

  scrollToQuestion(questionEl) {
    questionEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },

  _isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }
};
