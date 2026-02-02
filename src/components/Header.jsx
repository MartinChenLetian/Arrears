import { useEffect, useState } from 'react';

const projectName = '电子催费单';

export default function Header() {
  const [showHotline, setShowHotline] = useState(false);
  const [isDark, setIsDark] = useState(false);

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

    applyTheme(shouldAutoEnable());

    const timer = setInterval(() => {
      applyTheme(shouldAutoEnable());
    }, 60 * 1000);

    return () => clearInterval(timer);
  }, []);

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
            {isDark ? '暗黑模式（17:45-06:00）' : '日间模式'}
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
              <button className="ghost" type="button" onClick={() => setShowHotline(false)}>
                <span className="text-full">关闭</span>
                <span className="text-short">关</span>
              </button>
            </div>
            <div className="modal-body">
              <img className="hotline-image" src="/hotline.jpg" alt="服务热线" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
