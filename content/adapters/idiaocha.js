// 问卷助手 - 爱调查适配器 (idiaocha.com)

const IdiaochaAdapter = {
  name: '爱调查',
  domain: 'idiaocha.com',

  isSurvey() {
    return !!document.querySelector('.topic, .question, [class*="survey"], [class*="question"]');
  },

  getQuestions() {
    const selectors = ['.topic', '.question', '.survey-question', '[class*="question-item"]', '.field'];
    for (const sel of selectors) {
      const nodes = document.querySelectorAll(sel);
      if (nodes.length >= 2) return Array.from(nodes);
    }
    return BaseAdapter.getQuestions();
  },

  getQuestionText(questionEl) {
    const title = questionEl.querySelector('.topic-title, .question-title, .title, h4, h5, strong, .q-title');
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
