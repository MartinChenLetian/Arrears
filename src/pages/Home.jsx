import { useEffect, useMemo, useRef, useState } from 'react';
import RecordModal from '../components/RecordModal';
import { buildAddressPattern, formatCurrency, safeText } from '../lib/format';
import { useRecords } from '../context/RecordsContext';

export default function Home() {
  const { activeRecords, loading, error, sourceFile, markProcessed, unmarkProcessed } = useRecords();
  const [mode, setMode] = useState('list');
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');

  const [cardIndex, setCardIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [completedStack, setCompletedStack] = useState([]);
  const [returnAccount, setReturnAccount] = useState(null);
  const dragStart = useRef(null);
  const activePointerId = useRef(null);

  const stats = useMemo(() => {
    return {
      total: activeRecords.length,
      sourceFile,
    };
  }, [activeRecords.length, sourceFile]);

  const filteredRecords = useMemo(() => {
    if (!query.trim()) return activeRecords;
    const pattern = buildAddressPattern(query);
    if (!pattern) return activeRecords;
    return activeRecords.filter((record) => pattern.test(record.address || ''));
  }, [activeRecords, query]);

  const currentRecord = filteredRecords[cardIndex] ?? null;

  useEffect(() => {
    if (cardIndex >= filteredRecords.length) {
      setCardIndex(Math.max(filteredRecords.length - 1, 0));
    }
  }, [filteredRecords.length, cardIndex]);

  useEffect(() => {
    if (!returnAccount) return;
    const idx = filteredRecords.findIndex((record) => record.accountNo === returnAccount);
    if (idx >= 0) {
      setCardIndex(idx);
      setReturnAccount(null);
    }
  }, [filteredRecords, returnAccount]);

  const handleMarkFromModal = async (note) => {
    if (!selectedRecord) return;
    const result = await markProcessed(selectedRecord, note);
    if (!result.ok) {
      setStatus(result.message || '标记失败');
      return;
    }
    setStatus('已标记为完成');
    setSelectedRecord(null);
  };

  const handleCardMark = async () => {
    if (!currentRecord) return;
    const result = await markProcessed(currentRecord, '');
    if (!result.ok) {
      setStatus(result.message || '标记失败');
      return;
    }
    setCompletedStack((prev) => [...prev, currentRecord.accountNo]);
    setStatus('已标记为完成');
  };

  const handleUndo = async () => {
    const lastAccount = completedStack[completedStack.length - 1];
    if (!lastAccount) return;
    const result = await unmarkProcessed(lastAccount);
    if (!result.ok) {
      setStatus(result.message || '撤销失败');
      return;
    }
    setCompletedStack((prev) => prev.slice(0, -1));
    setReturnAccount(lastAccount);
    setStatus('已撤销上一条');
  };

  const handlePointerDown = (event) => {
    if (!currentRecord) return;
    if (activePointerId.current !== null) return;
    activePointerId.current = event.pointerId;
    dragStart.current = event.clientX;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (dragStart.current === null || activePointerId.current !== event.pointerId) return;
    const delta = event.clientX - dragStart.current;
    setDragX(delta);
  };

  const handlePointerUp = async (event) => {
    if (dragStart.current === null || activePointerId.current !== event.pointerId) return;
    const delta = dragX;
    if (delta < -80) {
      setDragX(-140);
      setIsDragging(false);
      await handleCardMark();
    } else if (delta > 80) {
      setDragX(140);
      setIsDragging(false);
      await handleUndo();
    }
    setDragX(0);
    setIsDragging(false);
    dragStart.current = null;
    activePointerId.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>催费工作台</h1>
          <p className="muted">
            数据来源：{stats.sourceFile ? stats.sourceFile : '数据库导入'}，共 {stats.total} 条待催费记录
          </p>
        </div>
        <div className="mode-controls">
          <input
            className="search"
            type="search"
            placeholder="搜索地址（- 可代替 1~5 个中文字）"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="mode-toggle">
          <button
            className={mode === 'list' ? 'active' : ''}
            type="button"
            onClick={() => setMode('list')}
          >
            列表模式
          </button>
          <button
            className={mode === 'card' ? 'active' : ''}
            type="button"
            onClick={() => setMode('card')}
          >
            卡片模式
          </button>
          </div>
        </div>
      </div>

      {status && <div className="status">{status}</div>}
      {loading && <div className="status">正在加载数据…</div>}
      {error && <div className="status error">{error}</div>}

      {!loading && !error && mode === 'list' && (
        <div className="record-list">
          {filteredRecords.length === 0 && <div className="empty">暂无待催费记录</div>}
          {filteredRecords.map((record) => (
            <button
              key={record.accountNo}
              className="record-item"
              type="button"
              onClick={() => setSelectedRecord(record)}
            >
              <div>
                <div className="record-title">{safeText(record.address)}</div>
                <div className="record-sub">
                  {safeText(record.name)} · 户号 {safeText(record.accountNo)}
                </div>
              </div>
              <div className="record-amount">
                <span>欠费</span>
                <strong>{formatCurrency(record.arrears)}</strong>
              </div>
            </button>
          ))}
        </div>
      )}

      {!loading && !error && mode === 'card' && (
        <div className="card-mode">
          {filteredRecords.length === 0 ? (
            <div className="empty">暂无待催费记录</div>
          ) : (
            <div
              className="record-card"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{
                transform: `translateX(${dragX}px)`,
                transition: isDragging ? 'none' : 'transform 0.2s ease',
              }}
            >
              <div className="card-header">
                <div>
                  <h2>{safeText(currentRecord?.name)}</h2>
                  <p>户号：{safeText(currentRecord?.accountNo)}</p>
                </div>
                <span className="badge">{cardIndex + 1} / {filteredRecords.length}</span>
              </div>
              <div className="card-body">
                <div>
                  <span className="label">用电地址</span>
                  <div>{safeText(currentRecord?.address)}</div>
                </div>
                <div className="card-grid">
                  <div>
                    <span className="label">欠费金额</span>
                    <div>{formatCurrency(currentRecord?.arrears)}</div>
                  </div>
                  <div>
                    <span className="label">本月电费</span>
                    <div>{formatCurrency(currentRecord?.currentFee)}</div>
                  </div>
                  <div>
                    <span className="label">电费总和</span>
                    <div>{formatCurrency(currentRecord?.totalFee)}</div>
                  </div>
                </div>
              </div>
              <div className="card-footer">
                <button className="ghost" type="button" onClick={() => setCardIndex((prev) => Math.min(prev + 1, filteredRecords.length - 1))}>
                  跳过
                </button>
                <button className="primary" type="button" onClick={handleCardMark}>
                  滑动或点击完成
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <RecordModal
        record={selectedRecord}
        isOpen={Boolean(selectedRecord)}
        onClose={() => setSelectedRecord(null)}
        onMark={handleMarkFromModal}
      />
    </section>
  );
}
