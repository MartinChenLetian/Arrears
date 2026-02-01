import { useState } from 'react';

const projectName = '电子催费单';

export default function Header() {
  const [showHotline, setShowHotline] = useState(false);

  return (
    <>
      <header className="app-header">
        <div className="header-title">
          <span className="title-dot" />
          {projectName}
        </div>
        <nav className="header-actions">
          <button className="hotline-btn" type="button" onClick={() => setShowHotline(true)}>
            服务热线
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
                关闭
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
