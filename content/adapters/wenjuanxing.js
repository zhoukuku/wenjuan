// 问卷助手 - 问卷星适配器 (wjx.cn / wjx.com / sojump.com)

const WenjuanxingAdapter = {
  name: '问卷星',
  domain: 'wjx.cn|wjx.com|sojump.com',

  isSurvey() {
    return !!document.querySelector('.field, .question, #ctlNext, #submit_button, .submitbtn');
  },

  getQuestions() {
    // 问卷星常见结构
    // 新版: div.field.ui-field-contain
    // 旧版: div.div_question
    const selectors = [
      '.field.ui-field-contain',
      '.div_question',
      '.question_item',
      'div[class*="question"]',
      '.ui-field-contain'
    ];
    for (const sel of selectors) {
      const nodes = document.querySelectorAll(sel);
      if (nodes.length >= 2) return Array.from(nodes);
    }
    return BaseAdapter.getQuestions.call(this);
  },

  getQuestionText(questionEl) {
    // 问卷星标题通常在 .field-label 或 legend 中
    const label = questionEl.querySelector('.field-label, .question-title, legend, .title');
    if (label) {
      const text = label.textContent.trim();
      // 去掉题号前缀如 "1." "第1题"
      return text.replace(/^\d+[\.\、\)）]\s*/, '').replace(/^第\d+题[：:]*\s*/, '');
    }
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

    // 输入框
    const textInputs = questionEl.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="number"], textarea, input:not([type])');
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

  getNextButton() {
    return document.querySelector('#ctlNext, #submit_button, .submitbtn, .next-btn, #next, button[type="submit"]') ||
      BaseAdapter.getNextButton();
  },

  getPrevButton() {
    return document.querySelector('#ctlPrev, .prev-btn, #prev') ||
      BaseAdapter.getPrevButton();
  },

  getProgress() {
    // 问卷星进度条
    const progressEl = document.querySelector('#ctlProgress, .progress-bar, [class*="progress"]');
    if (progressEl) {
      const style = progressEl.style.width || progressEl.getAttribute('style') || '';
      const pct = style.match(/(\d+)%/);
      if (pct) return { current: parseInt(pct[1]), total: 100, isPercentage: true };
    }
    // 页码
    const pageInfo = document.querySelector('.page-info, .page_num, #pageInfo');
    if (pageInfo) {
      const match = pageInfo.textContent.match(/(\d+)\s*\/\s*(\d+)/);
      if (match) return { current: parseInt(match[1]), total: parseInt(match[2]) };
    }
    return BaseAdapter.getProgress();
  }
};
