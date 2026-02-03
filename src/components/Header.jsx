import { useEffect, useState } from 'react';

const projectName = '电子催费单';

export default function Header() {
  const [showHotline, setShowHotline] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [isForced, setIsForced] = useState(false);
  const [showImageActions, setShowImageActions] = useState(false);
  const [shareHint, setShareHint] = useState('');

  useEffect(() => {
    const applyTheme = (value) => {
      setIsDark(value);
      document.documentElement.setAttribute('data-theme', value ? 'dark' : 'default');
    };

    const shouldAutoEnable = () => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const after1745 = hours > 17 || (hours === 17 && minutes >= 45);
      const before0600 = hours < 6;
      return after1745 || before0600;
    };

    const clearOverrideIfExpired = () => {
      const raw = localStorage.getItem('themeOverrideUntil');
      if (!raw) return false;
      const until = Number(raw);
      if (!Number.isFinite(until)) return false;
      if (Date.now() >= until) {
        localStorage.removeItem('themeOverride');
        localStorage.removeItem('themeValue');
        localStorage.removeItem('themeOverrideUntil');
        setIsForced(false);
        return true;
      }
      return false;
    };

    clearOverrideIfExpired();

    const storedOverride = localStorage.getItem('themeOverride');
    const storedValue = localStorage.getItem('themeValue');
    if (storedOverride === 'true' && storedValue) {
      setIsForced(true);
      applyTheme(storedValue === 'dark');
    } else {
      applyTheme(shouldAutoEnable());
    }

    const timer = setInterval(() => {
      if (clearOverrideIfExpired()) {
        applyTheme(shouldAutoEnable());
        return;
      }
      if (localStorage.getItem('themeOverride') === 'true') return;
      applyTheme(shouldAutoEnable());
    }, 60 * 1000);

    return () => clearInterval(timer);
  }, []);

  const forceToggleTheme = () => {
    const next = !isDark;
    const now = new Date();
    const until = new Date(now);
    until.setDate(now.getDate() + 1);
    until.setHours(6, 0, 0, 0);
    localStorage.setItem('themeOverride', 'true');
    localStorage.setItem('themeValue', next ? 'dark' : 'default');
    localStorage.setItem('themeOverrideUntil', String(until.getTime()));
    setIsForced(true);
    setIsDark(next);
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'default');
  };

  useEffect(() => {
    const handleKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        forceToggleTheme();
      }
    };

    const handleMotion = (() => {
      let lastTrigger = 0;
      let shakeCount = 0;
      return (event) => {
        const acc = event.accelerationIncludingGravity;
        if (!acc) return;
        const magnitude = Math.sqrt(
          (acc.x || 0) * (acc.x || 0) +
          (acc.y || 0) * (acc.y || 0) +
          (acc.z || 0) * (acc.z || 0)
        );
        const now = Date.now();
        if (magnitude > 25) {
          shakeCount += 1;
          if (shakeCount >= 3 && now - lastTrigger > 1500) {
            lastTrigger = now;
            shakeCount = 0;
            forceToggleTheme();
          }
        }
        if (now - lastTrigger > 2000) shakeCount = 0;
      };
    })();

    const enableMotion = () => {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission().catch(() => {});
      }
    };

    window.addEventListener('keydown', handleKey);
    window.addEventListener('devicemotion', handleMotion);
    window.addEventListener('touchstart', enableMotion, { once: true });

    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, [isDark]);

  return (
    <>
      <header className="app-header">
        <div className="header-title">
          <span className="title-dot" />
          <span className="title-text">
            <span className="text-full">{projectName}</span>
            <span className="text-short">电子催费</span>
          </span>
          <span className="theme-status">
            {isDark
              ? `暗黑模式${isForced ? '（强制）' : '（17:45-06:00）'}`
              : `${isForced ? '日间模式（强制）' : '日间模式'}`}
          </span>
        </div>
        <nav className="header-actions">
          <button className="hotline-btn" type="button" onClick={() => setShowHotline(true)}>
            <span className="text-full">服务热线</span>
            <span className="text-short">热线</span>
          </button>
        </nav>
      </header>
      {showHotline && (
        <div className="modal-backdrop" onClick={() => setShowHotline(false)}>
          <div className="modal hotline-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>服务热线</h2>
                <p className="muted">点击图片可保存或放大查看</p>
              </div>
              <button
                className="ghost share-btn"
                type="button"
                aria-label="分享"
                onClick={async () => {
                  try {
                    const res = await fetch('/hotline.jpg');
                    const blob = await res.blob();
                    const file = new File([blob], 'hotline.jpg', { type: blob.type || 'image/jpeg' });
                    if (navigator.share) {
                      if (navigator.canShare?.({ files: [file] })) {
                        await navigator.share({ files: [file], title: '服务热线' });
                      } else {
                        await navigator.share({ title: '服务热线', url: '/hotline.jpg' });
                      }
                    } else {
                      await navigator.share({ title: '服务热线', url: '/hotline.jpg' });
                    }
                  } finally {
                    setShowHotline(false);
                  }
                }}
              >
                <svg className="share-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M12 3l4 4h-3v6h-2V7H8l4-4zm-6 9h2v6h8v-6h2v8H6v-8z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="hotline-wrap">
                <img className="hotline-image" src="/hotline.jpg" alt="服务热线" />
                <div className="hotline-overlay" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      )}

      {showImageActions && (
        <div className="sheet-backdrop" onClick={() => setShowImageActions(false)}>
          <div className="sheet" onClick={(event) => event.stopPropagation()}>
            <button
              className="sheet-item"
              type="button"
              onClick={() => {
                (async () => {
                  try {
                    setShareHint('');
                    if (navigator.share) {
                      const res = await fetch('/hotline.jpg');
                      const blob = await res.blob();
                      const file = new File([blob], 'hotline.jpg', { type: blob.type || 'image/jpeg' });
                      if (navigator.canShare?.({ files: [file] })) {
                        await navigator.share({ files: [file], title: '服务热线' });
                      } else {
                        await navigator.share({ title: '服务热线', url: '/hotline.jpg' });
                      }
                    } else {
                      setShareHint('当前浏览器不支持系统保存，请长按图片保存');
                    }
                  } finally {
                    setShowImageActions(false);
                  }
                })();
              }}
            >
              保存图片
            </button>
            <button
              className="sheet-item"
              type="button"
              onClick={async () => {
                try {
                  setShareHint('');
                  if (navigator.share) {
                    await navigator.share({ title: '服务热线', url: '/hotline.jpg' });
                  } else {
                    setShareHint('当前浏览器不支持系统分享，请长按图片保存');
                  }
                } finally {
                  setShowImageActions(false);
                }
              }}
            >
              转发
            </button>
            {shareHint && <div className="sheet-hint">{shareHint}</div>}
            <button className="sheet-cancel" type="button" onClick={() => setShowImageActions(false)}>
              取消
            </button>
          </div>
        </div>
      )}
    </>
  );
}
