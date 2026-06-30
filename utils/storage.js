// 问卷助手 - Chrome Storage API 封装
// 在 content script 中通过 chrome.storage.sync 读写用户设置

// 🔍 诊断日志：确认 content script 已注入
console.log(
  '%c[问卷助手] %c✅ Content Script 已注入 %c| %c' + window.location.href.substring(0, 60) + '%c',
  'font-weight:bold;color:#4caf50;',
  'color:#333;',
  'color:#999;',
  'color:#666;',
  ''
);

const Storage = {
  /**
   * 获取所有设置
   */
  async getAll() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(null, resolve);
    });
  },

  /**
   * 获取指定 key
   */
  async get(key) {
    return new Promise((resolve) => {
      chrome.storage.sync.get(key, (result) => {
        resolve(result[key]);
      });
    });
  },

  /**
   * 保存设置
   */
  async set(items) {
    return new Promise((resolve) => {
      chrome.storage.sync.set(items, resolve);
    });
  },

  /**
   * 获取片段列表
   */
  async getSnippets() {
    const snippets = await this.get('snippets');
    return snippets || [];
  },

  /**
   * 保存片段列表
   */
  async saveSnippets(snippets) {
    await this.set({ snippets });
  },

  /**
   * 获取功能开关状态
   */
  async getToggles() {
    const keys = ['keyboardEnabled', 'snippetsEnabled', 'attentionEnabled', 'progressEnabled'];
    return new Promise((resolve) => {
      chrome.storage.sync.get(keys, (result) => {
        resolve({
          keyboard: result.keyboardEnabled !== false,
          snippets: result.snippetsEnabled !== false,
          attention: result.attentionEnabled !== false,
          progress: result.progressEnabled !== false
        });
      });
    });
  },

  /**
   * 获取答题统计
   */
  async getStats() {
    const defaultStats = { totalSurveys: 0, totalQuestions: 0, avgTimePerQuestion: 12 };
    const stats = await this.get('stats');
    return stats || defaultStats;
  },

  /**
   * 更新答题统计
   */
  async updateStats(delta) {
    const stats = await this.getStats();
    Object.assign(stats, delta);
    await this.set({ stats });
  }
};
