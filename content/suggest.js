// 问卷助手 - 智能推荐引擎 v2
// 角色扮演 + 题型分类 + 策略推断 → 自动推荐最优答案

const Suggest = {
  _enabled: true,
  _adapter: null,
  _snippets: [],
  _activeBar: null,
  _lastQuestionIdx: -1,
  _processingTimer: null,
  _appliedCount: 0,  // 本问卷已推荐的次数

  async init(adapter) {
    this._adapter = adapter;
    this._snippets = await Storage.getSnippets();
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.snippets) {
        this._snippets = changes.snippets.newValue || [];
      }
    });
    this._observeQuestions();
  },

  // ========================
  // 题型分类
  // ========================

  /** 对题目文本分类，返回题型和推断策略 */
  _classify(qText) {
    const t = qText;

    // ===== 陷阱题（最高优先级） =====
    if (/请\s*选择|此题.*选|不要.*选|注意\s*力|忽略此题/.test(t)) {
      return { type: 'trap', strategy: 'warn', priority: -1 };
    }

    // ===== 具体场景题（优先级高于通用人口统计） =====

    // 价格预测/市场判断（必须在城市之前判断，"购房城市的房价"含"城市"会误判）
    if (/房价|股价|金价|物价|价格.*(上涨|下跌|走势|趋势|变化|将会|预计)/.test(t) || /会上涨|会下跌|涨.*跌/.test(t))
      return { type: 'price_prediction', strategy: 'slightly_positive', priority: 6 };

    // 购买意愿/可能性 — 必须在年龄之前判断（"多大可能"含"多大"会误判）
    if (/未来.*(购房|买房|购车|买车|购买|购入|投资)/.test(t) || /打算.*买|计划.*买|准备.*买/.test(t))
      return { type: 'purchase_intent', strategy: 'moderate_positive', priority: 6 };
    if (/多大\s*可能|可能性.*多大|会不会.*买|多大\s*概率|多大\s*程度|多大\s*几率/.test(t))
      return { type: 'likelihood', strategy: 'moderate_positive', priority: 6 };

    // 满意度/同意度
    if (/满意|满意度|评分|几分|打.*分|评价/.test(t))
      return { type: 'satisfaction', strategy: 'slightly_positive', priority: 5 };
    if (/同意|认可|赞同|认同/.test(t))
      return { type: 'agreement', strategy: 'slightly_positive', priority: 5 };

    // 频率题
    if (/频率|多久\s*一次|多久\s*次|每天|每周|每月|经常/.test(t))
      return { type: 'frequency', strategy: 'moderate', priority: 4 };

    // 认知/了解
    if (/听说过|知道|了解|认识|见过/.test(t) && !/是否/.test(t))
      return { type: 'awareness', strategy: 'affirmative', priority: 7 };

    // 使用/购买经历
    if (/使用过|用过|购买过|买过|消费过/.test(t))
      return { type: 'experience', strategy: 'affirmative', priority: 7 };

    // 拥有
    if (/拥有|有没有|是否有/.test(t) && /车|房|宠物/.test(t))
      return { type: 'ownership', strategy: 'moderate', priority: 6 };

    // Likert 量表
    if (/非常.*不|很.*不|程度|级别/.test(t))
      return { type: 'likert', strategy: 'middle', priority: 3 };

    // ===== 人口统计信息（精确匹配，避免歧义） =====
    if (/姓\s*名|名\s*字|怎么称呼|您\s*的\s*名/.test(t))
      return { type: 'name', strategy: 'snippet', category: '姓名', priority: 10 };
    if (/性别|男女/.test(t))
      return { type: 'gender', strategy: 'snippet', category: '性别', priority: 10 };
    // 年龄："多大"后不能跟"可能/概率/程度/几率"（已在上面 likelihood 拦截）
    if (/年\s*龄|出生\s*(年份|日期)?|几\s*岁|多大\s*(年纪|岁数)?|周\s*岁/.test(t))
      return { type: 'age', strategy: 'snippet_or_consistency', category: '年龄', priority: 10 };
    if (/城\s*市|居\s*住|所在\s*地|哪个\s*省|哪个\s*市|常\s*住/.test(t))
      return { type: 'city', strategy: 'snippet_or_consistency', category: '城市', priority: 10 };
    if (/学\s*历|教育\s*程度|文化\s*程度|毕\s*业/.test(t))
      return { type: 'education', strategy: 'snippet_or_consistency', category: '学历', priority: 10 };
    if (/职\s*业|行\s*业|岗\s*位|职\s*位|从\s*事|工作\s*单位|工作\s*性质|工作\s*行业/.test(t))
      return { type: 'occupation', strategy: 'snippet_or_consistency', category: '职业', priority: 10 };
    if (/收\s*入|月\s*薪|年\s*薪|工\s*资|月\s*均/.test(t))
      return { type: 'income', strategy: 'snippet_or_consistency', category: '收入', priority: 10 };
    if (/邮\s*箱|email|电子邮件/i.test(t))
      return { type: 'email', strategy: 'snippet', category: '邮箱', priority: 10 };
    if (/手\s*机|电\s*话|联系\s*方式|号\s*码/.test(t))
      return { type: 'phone', strategy: 'snippet', category: '手机号', priority: 10 };
    if (/婚\s*姻|已\s*婚|未\s*婚|配\s*偶/.test(t))
      return { type: 'marital', strategy: 'snippet_or_consistency', category: '婚姻', priority: 8 };

    // 数量/金额 — 用合理默认值
    if (/多少.*钱|花费|支出|金额|价格|预算/.test(t))
      return { type: 'amount', strategy: 'moderate', priority: 4 };

    // 开放题 — 如果有片段匹配就用
    if (/请.*描述|请.*说明|请.*列举|意见|建议/.test(t))
      return { type: 'open_ended', strategy: 'skip', priority: 1 };

    // 默认
    return { type: 'unknown', strategy: 'neutral', priority: 2 };
  },

  // ========================
  // 主推荐逻辑
  // ========================

  async _findSuggestion(qText, questionEl) {
    if (!qText) return null;

    const classification = this._classify(qText);
    const options = this._adapter.getOptions(questionEl);
    const radioOpts = options.filter(o => o.type === 'radio');
    const textOpts = options.filter(o => o.type === 'text');

    // 陷阱题不推荐
    if (classification.type === 'trap') return null;

    // ── Level 0: AI 推荐（最高优先级，异步） ──
    if (typeof AI !== 'undefined' && AI.isReady() && radioOpts.length >= 2) {
      try {
        const aiResult = await AI.ask(qText, radioOpts);
        if (aiResult) {
          // 在选项中找 AI 返回的文本
          const match = radioOpts.find(o => o.text === aiResult.text);
          if (match) {
            return this._makeResult(match, `🤖 AI推荐: ${aiResult.text}`, 'ai', 11);
          }
          // 包含匹配
          const fuzzy = radioOpts.find(o =>
            o.text.includes(aiResult.text) || aiResult.text.includes(o.text)
          );
          if (fuzzy) {
            return this._makeResult(fuzzy, `🤖 AI推荐: ${fuzzy.text}`, 'ai', 11);
          }
        }
      } catch (_) { /* AI 失败，继续用本地策略 */ }
    }

    // ── Level 1: 一致性 ──
    const consistencyMatch = this._checkConsistency(qText, radioOpts);
    if (consistencyMatch) return consistencyMatch;

    // ── Level 2: 片段 ──
    if (classification.strategy.includes('snippet')) {
      const snippetMatch = this._matchSnippet(qText, radioOpts, textOpts);
      if (snippetMatch) return snippetMatch;
    }

    // ── Level 3: 策略推断 ──
    if (radioOpts.length >= 1) {
      return this._strategyPick(classification, radioOpts, qText);
    }

    // 文本/数字输入
    if (textOpts.length > 0) {
      return this._handleTextQuestion(qText, textOpts);
    }

    return null;
  },

  // ========================
  // 策略实现
  // ========================

  _strategyPick(c, radioOpts, qText) {
    const len = radioOpts.length;
    if (len === 0) return null;

    // 统一的多选题处理（checkbox group）
    const isMulti = radioOpts.some(o => o.type === 'checkbox');
    if (isMulti && len >= 2) {
      // 多选题：只选第一个（最安全），避免全选
      return this._makeResult(radioOpts[0], '多选：仅选首项', 'strategy', 3);
    }

    switch (c.strategy) {
      case 'moderate_positive':
        let posOpt = this._findText(radioOpts, /比较/);
        if (!posOpt) posOpt = this._findText(radioOpts, /可能|也许|大概|考虑|打算|计划/);
        if (posOpt) return this._makeResult(posOpt, '推荐偏正面选项', 'strategy', 6);
        return this._makeResult(radioOpts[Math.min(1, len-1)], '推荐中等选项', 'strategy', 5);

      case 'slightly_positive':
        let slPos = this._findText(radioOpts, /保持不变|持平|稳定|不变/);
        if (!slPos) slPos = this._findText(radioOpts, /小幅\s*(上涨|上升|增长)|略有.*(涨|升|增)/);
        if (!slPos) slPos = this._findText(radioOpts, /比较|满意|同意|好|喜欢/);
        if (slPos) return this._makeResult(slPos, '推荐中性偏正面', 'strategy', 5);
        return this._makeResult(radioOpts[Math.floor(len/2)], '推荐中间选项', 'strategy', 4);

      case 'price_prediction':
        // 房价/物价预测：优先"保持不变/稳定"，其次"小幅上涨"
        let pp = this._findText(radioOpts, /保持不变|持平|稳定|不变|基本.*不变/);
        if (!pp) pp = this._findText(radioOpts, /小幅\s*(上涨|上升)/);
        if (!pp) pp = this._findText(radioOpts, /小幅\s*(下跌|下降)/);
        if (pp) return this._makeResult(pp, '预测：推荐保守选项', 'strategy', 6);
        return this._makeResult(radioOpts[Math.floor(len/2)], '预测：推荐中间选项', 'strategy', 4);

      case 'affirmative':
        // 精确匹配肯定词（避免"是"/"有"误匹配）
        let yes = this._findText(radioOpts, /^\s*是\s*$|^\s*有\s*$|^\s*知道\s*$|^\s*了解\s*$/);
        if (!yes) yes = this._findText(radioOpts, /听说过|见过|用过|买过|去过|吃过|喝过/);
        if (!yes) yes = this._findText(radioOpts, /会|愿意|喜欢|感兴趣/);
        if (yes) return this._makeResult(yes, '推荐肯定回答', 'strategy', 7);
        // 第一个通常为"是/有"
        return this._makeResult(radioOpts[0], '推荐首选', 'strategy', 6);

      case 'moderate':
      case 'frequency':
        const mid = this._findText(radioOpts, /偶尔|有时|一般|中等|适中|不确定/);
        if (mid) return this._makeResult(mid, '推荐中间选项', 'strategy', 4);
        return this._makeResult(radioOpts[Math.floor(len/2)], '推荐中间选项', 'strategy', 3);

      case 'middle':
      case 'likert':
        return this._makeResult(radioOpts[Math.floor(len/2)], '推荐中间选项', 'strategy', 3);

      case 'ownership':
        // 拥有题：默认否（避免选"是"触发追问）
        let noOpt = this._findText(radioOpts, /没有|无|不是|否|不会/);
        if (noOpt) return this._makeResult(noOpt, '推荐否定（避免追问）', 'strategy', 5);
        return this._makeResult(radioOpts[Math.min(1, len-1)], '推荐否定选项', 'strategy', 4);

      case 'neutral':
      case 'snippet_or_consistency':
        const neu = this._findText(radioOpts, /一般|不确定|不知道|没意见|中性|普通|其他/);
        if (neu) return this._makeResult(neu, '推荐中性选项', 'strategy', 3);
        return this._makeResult(radioOpts[Math.floor(len/2)], '推荐中间选项', 'strategy', 2);

      default:
        return this._makeResult(radioOpts[Math.floor(len/2)], '推荐中间选项', 'strategy', 1);
    }
  },

  _handleTextQuestion(qText, textOpts) {
    // 1) 片段匹配
    const snippetMatch = this._matchSnippet(qText, [], textOpts);
    if (snippetMatch) return snippetMatch;

    // 2) 数字输入检测
    const numPatterns = [
      { re: /多少.*钱|花费|支出|金额|价格|预算|元|块钱/, val: '500' },
      { re: /几.*次|多少.*次|次数|频率.*数字/, val: '3' },
      { re: /几.*年|多少.*年|年限|时长.*年/, val: '5' },
      { re: /几.*月|多少.*月|月数/, val: '12' },
      { re: /几.*天|多少.*天|天数/, val: '7' },
      { re: /几.*人|多少.*人|人数|家里.*口/, val: '3' },
      { re: /几.*平米|多少.*平|面积|平方/, val: '100' },
    ];

    for (const pat of numPatterns) {
      if (pat.re.test(qText)) {
        return {
          text: pat.val,
          source: 'strategy',
          label: `推断数值「${pat.val}」（可手动修改）`,
          priority: 3
        };
      }
    }

    // 3) 百分比输入
    if (/百分比|百分数|占比|比例.*%/.test(qText)) {
      return { text: '50', source: 'strategy', label: '推荐「50」（可修改）', priority: 2 };
    }

    return null; // 开放题不瞎填
  },

  // ========================
  // 辅助方法
  // ========================

  _findText(opts, regex) {
    return opts.find(o => regex.test(o.text));
  },

  _makeResult(opt, label, source, priority) {
    // 找到可描边的可见容器
    const clickEl = opt.clickEl || opt.el;
    const outlineEl = clickEl
      ? (clickEl.closest('li') || clickEl.closest('[class*="option"]') || clickEl.closest('[class*="choice"]') || clickEl.closest('[class*="answer"]') || clickEl)
      : null;

    return {
      text: opt.text,
      source: source,
      label: label,
      optionEl: opt.el,
      clickEl: clickEl,
      outlineEl: outlineEl,
      priority: priority
    };
  },

  _checkConsistency(qText, radioOpts) {
    if (typeof Consistency === 'undefined') return null;

    const category = Consistency._detectCategory(qText);
    if (!category) return null;

    const prev = (Consistency._answers || []).find(a => a.category && a.category.key === category.key);
    if (!prev) return null;

    // 在选项中找最接近的
    for (const opt of radioOpts) {
      if (opt.text.includes(prev.answer) || prev.answer.includes(opt.text)) {
        return this._makeResult(opt, `前面选了「${prev.answer}」→保持一致`, 'consistency', 10);
      }
    }
    // 数字匹配
    const prevNums = prev.answer.match(/\d+/g);
    if (prevNums) {
      for (const opt of radioOpts) {
        const optNums = opt.text.match(/\d+/g);
        if (optNums && optNums.some(n => prevNums.includes(n))) {
          return this._makeResult(opt, `前面选了「${prev.answer}」→保持一致`, 'consistency', 10);
        }
      }
    }
    return null;
  },

  _matchSnippet(qText, radioOpts, textOpts) {
    if (!this._snippets.length) return null;

    // 增强型关键词 → 片段标签映射（支持多词匹配 + 得分排序）
    const mapping = [
      { kw: ['姓名', '名字', '称呼', '贵姓'], labels: ['姓名', '名字'], score: 10 },
      { kw: ['性别', '男女'], labels: ['性别'], score: 10 },
      { kw: ['年龄', '出生', '几岁', '多大年纪', '多大岁数', '周岁', '年份', '芳龄'], labels: ['年龄', '出生年份'], score: 8 },
      { kw: ['城市', '居住', '所在地', '哪个省', '哪个市', '常住', '现居'], labels: ['城市', '省份', '地区'], score: 8 },
      { kw: ['学历', '教育', '文化', '毕业', '学位'], labels: ['学历'], score: 8 },
      { kw: ['职业', '工作', '行业', '岗位', '职位', '从事', '单位', '公司', '就业'], labels: ['职业'], score: 7 },
      { kw: ['收入', '月薪', '年薪', '工资', '月均', '年收入', '薪资', '薪酬'], labels: ['月收入', '收入'], score: 7 },
      { kw: ['邮箱', 'email', 'e-mail', '电子邮件', '电子邮箱'], labels: ['邮箱', 'Email'], score: 10 },
      { kw: ['手机', '电话', '联系方式', '号码', '手机号'], labels: ['手机号', '电话'], score: 9 },
      { kw: ['婚姻', '已婚', '未婚', '配偶', '夫妻'], labels: ['婚姻状况'], score: 8 },
      { kw: ['子女', '孩子', '小孩', '有无子女', '儿女', '宝宝', '宝贝'], labels: ['子女情况'], score: 7 },
    ];

    // 分词匹配：题目的每个 2-3 字片段匹配关键词
    const tokens = this._tokenize(qText);
    let bestMatch = null, bestScore = 0;

    for (const map of mapping) {
      const matchCount = map.kw.filter(k => tokens.some(t => t.includes(k) || k.includes(t))).length;
      const directMatch = map.kw.some(k => qText.includes(k)); // 直接包含
      const totalScore = matchCount * 2 + (directMatch ? map.score : 0);

      if (totalScore <= 0) continue;

      for (const label of map.labels) {
        const snippet = this._snippets.find(s =>
          s.label.includes(label) || label.includes(s.label)
        );
        if (!snippet || !snippet.value) continue;

        // 单选：匹配选项文本
        if (radioOpts.length > 0) {
          for (const opt of radioOpts) {
            let optScore = 0;
            if (opt.text === snippet.value) optScore = 10;           // 完全匹配
            else if (opt.text.includes(snippet.value)) optScore = 7;  // 包含
            else if (snippet.value.includes(opt.text)) optScore = 5;  // 被包含
            else {
              // 数字匹配（如 "15000-25000" vs "15000元以上"）
              const sNums = (snippet.value.match(/\d+/g) || []).sort().join(',');
              const oNums = (opt.text.match(/\d+/g) || []).sort().join(',');
              if (sNums && oNums && (sNums.includes(oNums) || oNums.includes(sNums))) optScore = 4;
            }
            if (optScore > bestScore) {
              bestScore = optScore;
              bestMatch = this._makeResult(opt, `预设「${snippet.label}」=${snippet.value}`, 'snippet', 9);
            }
          }
        }

        // 文本输入
        if (textOpts.length > 0 && totalScore > bestScore) {
          bestScore = totalScore;
          bestMatch = { text: snippet.value, source: 'snippet', label: `预设「${snippet.label}」`, priority: 9 };
        }
      }
    }

    return bestMatch;
  },

  /** 中文文本简单分词：按 1-3 字切分 */
  _tokenize(text) {
    const cleaned = text.replace(/[^一-龥a-zA-Z0-9]/g, ' ');
    const tokens = [];
    // 2-3 字窗口滑动
    for (let len = 2; len <= 3; len++) {
      for (let i = 0; i <= cleaned.length - len; i++) {
        tokens.push(cleaned.substring(i, i + len));
      }
    }
    // 也加入单个关键词
    cleaned.split(/\s+/).filter(w => w.length >= 1).forEach(w => tokens.push(w));
    return [...new Set(tokens)];
  },

  // ========================
  // UI 展示
  // ========================

  async _checkCurrentQuestion() {
    const questions = this._adapter.getQuestions();
    if (!questions.length) return;

    // 找视口中最近的题目
    let bestQ = null, bestDist = Infinity;
    const viewTop = window.scrollY + 120;
    questions.forEach((q) => {
      const rect = q.getBoundingClientRect();
      const absY = rect.top + window.scrollY;
      const dist = Math.abs(absY - viewTop);
      if (rect.height > 0 && dist < bestDist) { bestDist = dist; bestQ = q; }
    });
    if (!bestQ) return;

    // 用元素身份判断是否同一题（支持 Nfield 单题模式）
    const sameQuestion = this._activeQuestionEl === bestQ;
    const barVisible = this._activeBar && this._activeBar.isConnected;

    // 同一题且推荐条还在 → 不重复
    if (sameQuestion && barVisible) return;
    // 同一题但条被关了 → 不重试（等翻页/切换题目再触发）
    if (sameQuestion && !barVisible && this._activeQuestionEl) return;

    this._activeQuestionEl = bestQ;
    this._removeOutline();

    if (this._adapter.isQuestionAnswered(bestQ)) {
      this._removeBar();
      return;
    }

    const qText = this._adapter.getQuestionText(bestQ);

    const suggestion = await this._findSuggestion(qText, bestQ);
    if (suggestion) {
      this._showBar(bestQ, suggestion);
      this._addOutline(suggestion);
    } else {
      this._removeBar();
    }
  },

  _showBar(questionEl, s) {
    this._removeBar();

    const colors = {
      ai: { bg: '#f3e5f5', border: '#ce93d8', badge: '🤖 AI' },
      'ai-cache': { bg: '#f3e5f5', border: '#ce93d8', badge: '🤖 AI' },
      consistency: { bg: '#e8f5e9', border: '#81c784', badge: '🟢 一致' },
      snippet: { bg: '#e3f2fd', border: '#64b5f6', badge: '🔵 预设' },
      strategy: { bg: '#fff3e0', border: '#ffb74d', badge: '🟡 推荐' },
    };
    const c = colors[s.source] || colors.strategy;

    const bar = document.createElement('div');
    bar.className = 'wj-suggest-bar';
    bar.innerHTML = `
      <span class="wj-suggest-badge">${c.badge}</span>
      <span class="wj-suggest-label">${this._esc(s.label)}</span>
      <span class="wj-suggest-value">「${this._esc(s.text.substring(0, 40))}」</span>
      <button class="wj-suggest-apply">填入</button>
      <button class="wj-suggest-dismiss">✕</button>
    `;

    bar.style.cssText = `
      display:flex;align-items:center;gap:6px;margin-top:6px;padding:6px 10px;
      background:${c.bg};border:1px solid ${c.border};border-radius:6px;
      font-size:12px;color:#333;line-height:1.4;
      animation: wj-fadein 0.3s ease;
    `;
    bar.querySelector('.wj-suggest-badge').style.cssText = 'flex-shrink:0;font-size:11px;';
    bar.querySelector('.wj-suggest-label').style.cssText = 'color:#666;flex-shrink:0;';
    bar.querySelector('.wj-suggest-value').style.cssText = 'font-weight:600;color:#e65100;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    bar.querySelector('.wj-suggest-apply').style.cssText = 'flex-shrink:0;cursor:pointer;background:#ff9800;color:#fff;border:none;padding:3px 10px;border-radius:4px;font-size:11px;';
    bar.querySelector('.wj-suggest-dismiss').style.cssText = 'flex-shrink:0;cursor:pointer;background:none;border:none;color:#999;font-size:14px;padding:0 2px;';

    bar.querySelector('.wj-suggest-apply').addEventListener('click', (e) => {
      e.stopPropagation();
      this._apply(s, questionEl);
      bar.querySelector('.wj-suggest-apply').textContent = '✅';
      bar.querySelector('.wj-suggest-apply').style.background = '#4caf50';
      this._appliedCount++;
      setTimeout(() => { if (this._activeBar === bar) this._removeBar(); }, 1200);
    });

    bar.querySelector('.wj-suggest-dismiss').addEventListener('click', (e) => {
      e.stopPropagation(); this._removeBar();
    });

    questionEl.appendChild(bar);
    this._activeBar = bar;

    if (!document.getElementById('wj-suggest-anim')) {
      const st = document.createElement('style');
      st.id = 'wj-suggest-anim';
      st.textContent = '@keyframes wj-fadein{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}';
      document.head.appendChild(st);
    }
  },

  _apply(s, questionEl) {
    this._removeOutline();
    if (s.clickEl) {
      s.clickEl.click();
    } else if (s.optionEl) {
      s.optionEl.checked = true;
      s.optionEl.dispatchEvent(new Event('change', { bubbles: true }));
      s.optionEl.dispatchEvent(new Event('click', { bubbles: true }));
    } else {
      const inputs = questionEl.querySelectorAll('input[type="text"],input[type="email"],input[type="tel"],input[type="number"],textarea,input:not([type])');
      for (const inp of inputs) {
        if (['radio','checkbox','hidden','submit','button'].includes(inp.type)) continue;
        const setter = Object.getOwnPropertyDescriptor(
          inp.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value'
        ).set;
        setter.call(inp, s.text);
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
    }
  },

  _removeBar() {
    if (this._activeBar) { this._activeBar.remove(); this._activeBar = null; }
  },

  _addOutline(s) {
    this._removeOutline();
    if (!s.outlineEl) return;
    this._outlinedEl = s.outlineEl;
    s.outlineEl.style.outline = '3px solid #ff9800';
    s.outlineEl.style.outlineOffset = '2px';
    s.outlineEl.style.borderRadius = '4px';
    s.outlineEl.style.boxShadow = '0 0 10px rgba(255,152,0,0.4)';
    s.outlineEl.style.transition = 'outline 0.2s, box-shadow 0.2s';
  },

  _removeOutline() {
    if (this._outlinedEl) {
      this._outlinedEl.style.outline = '';
      this._outlinedEl.style.outlineOffset = '';
      this._outlinedEl.style.boxShadow = '';
      this._outlinedEl = null;
    }
  },

  _observeQuestions() {
    setTimeout(() => this._checkCurrentQuestion(), 500);
    setTimeout(() => { this._activeQuestionEl = null; this._checkCurrentQuestion(); }, 2000);

    // 持续低频率轮询
    setInterval(() => this._checkCurrentQuestion(), 2500);

    // 用户操作触发
    document.addEventListener('keydown', () => {
      clearTimeout(this._processingTimer);
      this._processingTimer = setTimeout(() => {
        this._activeQuestionEl = null;
        this._checkCurrentQuestion();
      }, 500);
    }, true);

    let scrollTimer;
    document.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        this._activeQuestionEl = null;
        this._checkCurrentQuestion();
      }, 600);
    }, true);
  },

  _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
};
