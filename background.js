// 问卷助手 - Service Worker
// 负责扩展安装/更新时的初始化和默认配置

const DEFAULT_SETTINGS = {
  // 功能开关
  keyboardEnabled: true,
  snippetsEnabled: true,
  attentionEnabled: true,
  progressEnabled: true,

  // 默认片段
  snippets: [
    { label: '姓名', value: '', type: 'text' },
    { label: '性别', value: '男', type: 'text' },
    { label: '年龄', value: '28', type: 'text' },
    { label: '城市', value: '北京', type: 'text' },
    { label: '学历', value: '本科', type: 'text' },
    { label: '职业', value: '企业职员', type: 'text' },
    { label: '月收入', value: '8000-15000元', type: 'text' },
    { label: '邮箱', value: '', type: 'email' },
    { label: '手机号', value: '', type: 'tel' }
  ],

  // 答题统计
  stats: {
    totalSurveys: 0,
    totalQuestions: 0,
    avgTimePerQuestion: 12 // 秒
  }
};

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.sync.set(DEFAULT_SETTINGS);
    console.log('[问卷助手] 已安装，默认设置已保存');
  } else if (details.reason === 'update') {
    // 合并新设置项（保留用户已有数据）
    const existing = await chrome.storage.sync.get(null);
    const merged = { ...DEFAULT_SETTINGS, ...existing };
    await chrome.storage.sync.set(merged);
    console.log('[问卷助手] 已更新到版本', chrome.runtime.getManifest().version);
  }
});

// 监听来自 popup/options 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getStats') {
    chrome.storage.sync.get('stats', (data) => {
      sendResponse(data.stats || DEFAULT_SETTINGS.stats);
    });
    return true; // 异步响应
  }
  if (message.type === 'updateStats') {
    chrome.storage.sync.get('stats', (data) => {
      const stats = data.stats || DEFAULT_SETTINGS.stats;
      Object.assign(stats, message.stats);
      chrome.storage.sync.set({ stats });
      sendResponse({ success: true });
    });
    return true;
  }
});
