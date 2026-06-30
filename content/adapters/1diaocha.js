// 问卷助手 - 第一调查网适配器 (1diaocha.com)

const Diaocha1Adapter = {
  name: '第一调查网',
  domain: '1diaocha.com',

  isSurvey() {
    return !!document.querySelector('.topic, .question, .survey-content, [class*="survey"]');
  },

  getQuestions() {
    const selectors = ['.topic', '.question', '.survey-item', '[class*="question-item"]', '.wd-question'];
    for (const sel of selectors) {
      const nodes = document.querySelectorAll(sel);
      if (nodes.length >= 2) return Array.from(nodes);
    }
    return BaseAdapter.getQuestions();
  },

  getQuestionText(questionEl) {
    const title = questionEl.querySelector('.topic-title, .question-title, .title, h4, h5, strong');
    if (title) return title.textContent.trim().replace(/^\d+[\.\、\)）]\s*/, '');
    return BaseAdapter.getQuestionText(questionEl);
  },

  getOptions(questionEl) {
    const options = [];
    const inputs = questionEl.querySelectorAll('input[type="radio"], input[type="checkbox"]');
    inputs.forEach(input => {
      const label = input.closest('label') ||
        questionEl.querySelector(`label[for="${input.id}"]`);
      options.push({
        el: input,
        text: label ? label.textContent.trim() : (input.value || ''),
        type: input.type,
        index: options.length
      });
    });

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

    const textInputs = questionEl.querySelectorAll('input[type="text"], input[type="email"], input[type="number"], textarea, input:not([type])');
    textInputs.forEach(input => {
      if (['radio', 'checkbox', 'hidden', 'submit', 'button'].includes(input.type)) return;
      options.push({ el: input, text: input.placeholder || input.name || '输入框', type: 'text' });
    });

    return options;
  },

  getNextButton() {
    return document.querySelector('.next-btn, .submit-btn, #next, button[type="submit"], .btn-primary') ||
      BaseAdapter.getNextButton();
  },

  getPrevButton() {
    return document.querySelector('.prev-btn, .back-btn, #prev') ||
      BaseAdapter.getPrevButton();
  },

  getProgress() {
    const info = document.querySelector('.page-info, .progress-info, .survey-progress');
    if (info) {
      const match = info.textContent.match(/(\d+)\s*\/\s*(\d+)/);
      if (match) return { current: parseInt(match[1]), total: parseInt(match[2]) };
    }
    return BaseAdapter.getProgress();
  }
};
