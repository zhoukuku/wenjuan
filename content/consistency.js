// 问卷助手 - 答案一致性追踪模块
// 记录用户在本问卷中的回答，后续出现同类问题时弹提示保持一致性

const Consistency = {
  _enabled: true,
  _adapter: null,
  _answers: [],        // { question, answer, category, time }
  _reminders: new WeakMap(), // 已添加的提醒标签，避免重复

  // 类别关键词映射
  _categories: [
    { key: 'age', label: '年龄', keywords: ['年龄', '出生', '周岁', '几岁', '多大', '岁数'] },
    { key: 'gender', label: '性别', keywords: ['性别', '男女'] },
    { key: 'city', label: '城市', keywords: ['城市', '居住', '所在地区', '所在地', '哪个省', '哪个市', '常住'] },
    { key: 'income', label: '收入', keywords: ['收入', '月薪', '年薪', '工资', '月均', '年收入', '家庭收入'] },
    { key: 'education', label: '学历', keywords: ['学历', '教育', '文化程度', '最高学历', '毕业'] },
    { key: 'occupation', label: '职业', keywords: ['职业', '工作', '行业', '岗位', '职位', '从事', '单位'] },
    { key: 'marital', label: '婚姻', keywords: ['婚姻', '已婚', '未婚', '配偶', '结婚'] },
    { key: 'children', label: '子女', keywords: ['子女', '孩子', '小孩', '儿女', '宝宝', '有无子女'] },
    { key: 'name', label: '姓名', keywords: ['姓名', '名字', '称呼'] },
    { key: 'phone', label: '手机', keywords: ['手机', '电话', '联系方式'] },
    { key: 'email', label: '邮箱', keywords: ['邮箱', '电子邮件', 'email', 'e-mail'] },
    { key: 'brand', label: '品牌偏好', keywords: ['品牌', '常用.*牌', '使用.*牌', '购买.*牌'] },
    { key: 'frequency', label: '使用频率', keywords: ['频率', '多久.*次', '每天.*次', '每周.*次', '经常'] },
    { key: 'amount', label: '消费金额', keywords: ['花费', '支出', '价格', '预算', '多少钱', '金额'] },
    { key: 'habit', label: '消费习惯', keywords: ['习惯', '偏好', '喜欢.*买', '通常.*买'] },
  ],

  /**
   * 初始化
   */
  async init(adapter) {
    this._adapter = adapter;
    const toggles = await Storage.getToggles();
    this._enabled = toggles.attention !== false; // 跟陷阱题开关联动

    this._observeAnswers();
    this._scanExisting();
  },

  /**
   * 记录用户的一次回答
   * @param {string} questionText - 题目文本
   * @param {string} answerText - 用户选择的答案文本
   */
  record(questionText, answerText) {
    if (!this._enabled || !questionText || !answerText) return;

    const category = this._detectCategory(questionText);
    if (!category) return; // 不追踪无类别的题

    // 检查是否已有同类答案
    const existing = this._answers.find(a => a.category.key === category.key);
    if (existing) {
      // 更新已有答案
      existing.question = questionText;
      existing.answer = answerText;
      existing.time = Date.now();
    } else {
      this._answers.push({
        question: questionText.substring(0, 80),
        answer: answerText.substring(0, 50),
        category: category,
        time: Date.now()
      });
    }

    // 扫描当前页面的其他题目，看是否需要添加提醒
    this._scanExisting();
  },

  /**
   * 检测题目文本属于哪个类别
   */
  _detectCategory(questionText) {
    const text = questionText.toLowerCase();
    for (const cat of this._categories) {
      for (const kw of cat.keywords) {
        try {
          if (new RegExp(kw, 'i').test(text)) return cat;
        } catch (_) {}
      }
    }
    return null;
  },

  /**
   * 扫描当前页面的所有题目，给匹配的题添加一致性提醒
   */
  _scanExisting() {
    if (!this._enabled) return;

    const questions = this._adapter.getQuestions();
    questions.forEach(q => {
      // 跳过已有提醒的
      if (this._reminders.has(q)) return;

      const qText = this._adapter.getQuestionText(q);
      if (!qText) return;

      const category = this._detectCategory(qText);
      if (!category) return;

      // 查找用户是否已回答过同类问题
      const existing = this._answers.find(a => a.category.key === category.key);
      if (!existing) return;

      // 当前题目的选中状态
      const options = this._adapter.getOptions(q);
      const selected = options.find(o => (o.type === 'radio' || o.type === 'checkbox') && o.el.checked);
      const currentAnswer = selected ? selected.text : null;

      // 如果当前已选答案和之前一致，不需要提醒
      if (currentAnswer && this._isAnswerConsistent(existing.answer, currentAnswer)) return;

      // 添加提醒标签
      this._addReminder(q, existing, currentAnswer);
    });
  },

  /**
   * 判断两个答案是否描述一致（简单比较）
   */
  _isAnswerConsistent(prevAnswer, currentAnswer) {
    // 提取数字
    const prevNums = prevAnswer.match(/\d+/g) || [];
    const currNums = currentAnswer.match(/\d+/g) || [];
    if (prevNums.length > 0 && currNums.length > 0) {
      if (prevNums.some(n => currNums.includes(n))) return true;
    }
    // 文本相似
    if (prevAnswer.includes(currentAnswer) || currentAnswer.includes(prevAnswer)) return true;
    return false;
  },

  /**
   * 添加一致性提醒标签
   */
  _addReminder(questionEl, existingAnswer, currentAnswer) {
    // 避免重复添加
    if (questionEl.querySelector('.wj-consistency-hint')) return;

    const hint = document.createElement('div');
    hint.className = 'wj-consistency-hint';
    hint.innerHTML = `
      <span class="wj-consistency-icon">💡</span>
      <span class="wj-consistency-text">
        之前回答「<strong>${this._escape(existingAnswer.answer)}</strong>」
        ${currentAnswer ? `→ 当前选了「${this._escape(currentAnswer)}」` : '→ 请保持一致'}
      </span>
      <span class="wj-consistency-close" title="关闭">✕</span>
    `;

    // 点击关闭
    hint.querySelector('.wj-consistency-close').addEventListener('click', (e) => {
      e.stopPropagation();
      hint.remove();
    });

    // 样式内联（不需要额外 CSS 文件）
    hint.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin: 4px 0 0 0;
      padding: 5px 10px;
      background: #e3f2fd;
      border: 1px solid #90caf9;
      border-radius: 6px;
      font-size: 12px;
      color: #1565c0;
      max-width: 100%;
      line-height: 1.4;
    `;
    hint.querySelector('.wj-consistency-close').style.cssText = `
      cursor: pointer;
      color: #90caf9;
      margin-left: auto;
      font-size: 14px;
      flex-shrink: 0;
    `;
    hint.querySelector('.wj-consistency-icon').style.cssText = 'flex-shrink:0;';

    // 插入到题目末尾
    questionEl.appendChild(hint);
    this._reminders.set(questionEl, existingAnswer);
  },

  /**
   * 监听用户的回答行为
   */
  _observeAnswers() {
    // 全局监听 click 和 change 事件
    document.addEventListener('change', (e) => {
      if (!this._enabled) return;
      const target = e.target;
      if (target.type === 'radio' && target.checked) {
        this._onRadioSelected(target);
      }
    }, true);

    document.addEventListener('click', (e) => {
      if (!this._enabled) return;
      // 处理 label 包裹的 radio
      const label = e.target.closest('label');
      if (label) {
        const radio = label.querySelector('input[type="radio"]');
        if (radio) {
          // 延迟等 checked 状态更新
          setTimeout(() => {
            if (radio.checked) this._onRadioSelected(radio);
          }, 100);
        }
      }
    }, true);
  },

  /**
   * 当用户选择了一个 radio 选项
   */
  _onRadioSelected(radioEl) {
    const questionEl = this._adapter._findQuestionContainer
      ? this._adapter._findQuestionContainer(radioEl)
      : radioEl.closest('fieldset, .field, [class*="question"]');

    if (!questionEl) return;

    const qText = this._adapter.getQuestionText(questionEl);
    const label = radioEl.closest('label') ||
      document.querySelector(`label[for="${radioEl.id}"]`);
    const answerText = label ? label.textContent.trim() : (radioEl.value || '');

    if (qText && answerText) {
      this.record(qText, answerText);
    }
  },

  /**
   * 清除所有一致性标签（用于重置）
   */
  clearAll() {
    document.querySelectorAll('.wj-consistency-hint').forEach(el => el.remove());
    this._reminders = new WeakMap();
  },

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};
