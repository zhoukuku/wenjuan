// 问卷助手 - 腾讯问卷适配器 (wj.qq.com)

const TencentAdapter = {
  name: '腾讯问卷',
  domain: 'wj.qq.com',

  isSurvey() {
    return !!document.querySelector('.question, .survey-question, .form-group, [class*="question"], #questionList');
  },

  getQuestions() {
    const selectors = [
      '.question', '.survey-question', '.form-group',
      '[class*="question-item"]', '.topic-item',
      '.field', '#questionList > div'
    ];
    for (const sel of selectors) {
      try {
        const nodes = document.querySelectorAll(sel);
        if (nodes.length >= 2) return Array.from(nodes);
      } catch (_) {}
    }
    return BaseAdapter.getQuestions();
  },

  getQuestionText(questionEl) {
    const title = questionEl.querySelector('.question-title, .topic-title, .field-label, label, h4, h5, strong, .q-title');
    if (title) return title.textContent.trim().replace(/^\d+[\.\、\)）]\s*/, '');
    return BaseAdapter.getQuestionText(questionEl);
  },

  getOptions(questionEl) {
    const options = [];
    questionEl.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(input => {
      const label = input.closest('label') || document.querySelector(`label[for="${input.id}"]`);
      options.push({
        el: input,
        text: label ? label.textContent.trim() : (input.value || ''),
        type: input.type,
        index: options.length
      });
    });
    questionEl.querySelectorAll('input[type="text"], input[type="email"], input[type="number"], textarea, input:not([type])').forEach(input => {
      if (['radio','checkbox','hidden','submit','button'].includes(input.type)) return;
      options.push({ el: input, text: input.placeholder || '输入框', type: 'text' });
    });
    return options;
  },

  getNextButton() {
    return document.querySelector('.btn-submit, .submit-btn, #submit, button[type="submit"], .next-btn, #next') ||
      BaseAdapter.getNextButton();
  },

  getPrevButton() {
    return document.querySelector('.prev-btn, .back-btn, #prev') || BaseAdapter.getPrevButton();
  },

  getProgress() {
    const bar = document.querySelector('.progress-bar, [class*="progress"]');
    if (bar) {
      const w = bar.style.width || '';
      const pct = w.match(/(\d+)%/);
      if (pct) return { current: parseInt(pct[1]), total: 100, isPercentage: true };
    }
    const page = document.querySelector('.page-info, .page-num');
    if (page) {
      const m = page.textContent.match(/(\d+)\s*\/\s*(\d+)/);
      if (m) return { current: parseInt(m[1]), total: parseInt(m[2]) };
    }
    return BaseAdapter.getProgress();
  },

  isQuestionAnswered(questionEl) {
    return BaseAdapter.isQuestionAnswered.call(this, questionEl);
  },

  scrollToQuestion(questionEl) {
    BaseAdapter.scrollToQuestion.call(this, questionEl);
  }
};
