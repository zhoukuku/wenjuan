// 问卷助手 - 投吧适配器 (toupiao.com)

const ToupiaoAdapter = {
  name: '投吧',
  domain: 'toupiao.com',

  isSurvey() {
    return !!document.querySelector('.question, .survey, [class*="question"], [class*="topic"]');
  },

  getQuestions() {
    const selectors = ['.question', '.topic', '.survey-item', '[class*="question-item"]', '.field'];
    for (const sel of selectors) {
      const nodes = document.querySelectorAll(sel);
      if (nodes.length >= 2) return Array.from(nodes);
    }
    return BaseAdapter.getQuestions();
  },

  getQuestionText(questionEl) {
    const title = questionEl.querySelector('.question-title, .title, h4, h5, strong, .q-text');
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

    const textInputs = questionEl.querySelectorAll('input[type="text"], input[type="email"], textarea, input:not([type])');
    textInputs.forEach(input => {
      if (['radio', 'checkbox', 'hidden', 'submit', 'button'].includes(input.type)) return;
      options.push({ el: input, text: input.placeholder || '输入框', type: 'text' });
    });

    return options;
  },

  getNextButton() {
    return document.querySelector('.next, .submit, #next, button[type="submit"], .btn-next') ||
      BaseAdapter.getNextButton();
  },

  getPrevButton() {
    return document.querySelector('.prev, .back, #prev') || BaseAdapter.getPrevButton();
  },

  getProgress() {
    return BaseAdapter.getProgress();
  }
};
