// 问卷助手 - 微信 UA 伪装模块
// 让 Chrome 伪装成微信内置浏览器，绕过"请在微信中打开"限制

const WechatMode = {
  _enabled: false,
  _originalUA: navigator.userAgent,
  _originalPlatform: navigator.platform,

  // 微信浏览器 UA（Android 版）
  WECHAT_UA_ANDROID: 'Mozilla/5.0 (Linux; Android 13; SM-S9080) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.210 Mobile Safari/537.36 MicroMessenger/8.0.43',

  // 微信浏览器 UA（iOS 版）
  WECHAT_UA_IOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.43',

  async init() {
    // 读取开关状态
    const result = await new Promise(resolve => {
      chrome.storage.local.get('wechatMode', resolve);
    });
    if (result.wechatMode) {
      this.enable();
    }

    // 监听 popup 消息
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === 'toggleWechatMode') {
        if (msg.enabled) {
          this.enable();
        } else {
          this.disable();
        }
        sendResponse({ enabled: this._enabled });
        return true;
      }
      if (msg.type === 'getWechatMode') {
        sendResponse({ enabled: this._enabled });
        return true;
      }
    });
  },

  /** 开启微信伪装 */
  enable() {
    if (this._enabled) return;
    this._enabled = true;

    // 1) 覆写 navigator 属性（影响客户端 JS 检测）
    Object.defineProperty(navigator, 'userAgent', {
      get: () => this.WECHAT_UA_ANDROID,
      configurable: true
    });

    // 2) 注入微微信相关全局变量（部分平台检测这个）
    if (typeof window.WeixinJSBridge === 'undefined') {
      window.WeixinJSBridge = {
        invoke: () => {},
        on: () => {},
        call: () => {}
      };
    }

    // 3) 模拟微信的 wx 对象
    if (typeof window.wx === 'undefined') {
      window.wx = {
        ready: (cb) => { if (cb) cb(); },
        config: () => {},
        checkJsApi: () => {},
        hideOptionMenu: () => {},
        showOptionMenu: () => {},
        onMenuShareTimeline: () => {},
        onMenuShareAppMessage: () => {},
        getNetworkType: () => {},
        closeWindow: () => window.close()
      };
    }

    this._showToast('📱 微信模式已开启');
    console.log('[问卷助手] 微信 UA 伪装已激活');
  },

  /** 关闭微信伪装 */
  disable() {
    if (!this._enabled) return;
    this._enabled = false;

    // 恢复 UA（需要重新定义属性）
    try {
      Object.defineProperty(navigator, 'userAgent', {
        get: () => this._originalUA,
        configurable: true
      });
    } catch (_) {}

    this._showToast('已恢复普通模式');
    console.log('[问卷助手] 微信伪装已关闭');
  },

  isEnabled() {
    return this._enabled;
  },

  _showToast(msg) {
    let toast = document.getElementById('wj-toast');
    if (!toast) { toast = document.createElement('div'); toast.id = 'wj-toast'; document.body.appendChild(toast); }
    toast.textContent = msg;
    toast.classList.add('wj-visible');
    clearTimeout(this._tId);
    this._tId = setTimeout(() => toast.classList.remove('wj-visible'), 2000);
  }
};
