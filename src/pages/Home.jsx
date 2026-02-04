import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import RecordModal from '../components/RecordModal';
import { buildAddressPattern, formatCurrency, safeText } from '../lib/format';
import { useRecords } from '../context/RecordsContext';

export default function Home() {
  const {
    records,
    activeRecords,
    processedMap,
    loading,
    error,
    sourceFile,
    syncStatus,
    loadProgress,
    markProcessedOptimistic,
    unmarkProcessed,
    flushPendingProcessed,
    saveRemarkDraft,
    getRemarkDraft,
  } = useRecords();
  const [mode, setMode] = useState('list');
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [showProcessed, setShowProcessed] = useState(false);
  const [processedQuery, setProcessedQuery] = useState('');
  const [selectedSegment, setSelectedSegment] = useState('EI35全部段号');
  const [batching, setBatching] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(() => new Set());
  const [isDesktop, setIsDesktop] = useState(false);
  const [restored, setRestored] = useState(false);
  const [pendingSelectedAccount, setPendingSelectedAccount] = useState('');

  const [cardIndex, setCardIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [completedStack, setCompletedStack] = useState([]);
  const [returnAccount, setReturnAccount] = useState(null);
  const dragStart = useRef(null);
  const activePointerId = useRef(null);

  const stats = useMemo(() => {
    const askedCount = records.filter((record) => record.asked).length;
    const processedCount = records.filter((record) => processedMap[record.accountNo]).length;
    return {
      total: records.length,
      active: activeRecords.length,
      asked: askedCount,
      processed: processedCount,
      sourceFile,
    };
  }, [records, activeRecords.length, processedMap, sourceFile]);

  const filteredRecords = useMemo(() => {
    const segmentFiltered =
      selectedSegment === 'EI35全部段号'
        ? activeRecords
        : activeRecords.filter((record) => record.meterSegment === selectedSegment);
    if (!query.trim()) return segmentFiltered;
    const term = query.trim();
    const pattern = buildAddressPattern(term);
    return segmentFiltered.filter((record) => {
      if (record.accountNo?.includes(term)) return true;
      if (record.name?.includes(term)) return true;
      if (pattern) return pattern.test(record.address || '');
      return record.address?.includes(term);
    });
  }, [activeRecords, query, selectedSegment]);

  useEffect(() => {
    if (!batching) setSelectedBatch(new Set());
  }, [batching]);

  useEffect(() => {
    if (restored) return;
    try {
      const raw = localStorage.getItem('home_state');
      if (raw) {
        const state = JSON.parse(raw);
        if (typeof state.query === 'string') setQuery(state.query);
        if (typeof state.selectedSegment === 'string') setSelectedSegment(state.selectedSegment);
        if (typeof state.mode === 'string') setMode(state.mode);
        if (typeof state.batching === 'boolean') setBatching(state.batching);
        if (typeof state.showProcessed === 'boolean') setShowProcessed(state.showProcessed);
        if (typeof state.processedQuery === 'string') setProcessedQuery(state.processedQuery);
        if (Array.isArray(state.selectedBatch)) {
          setSelectedBatch(new Set(state.selectedBatch));
        }
        if (typeof state.selectedRecord === 'string') {
          setPendingSelectedAccount(state.selectedRecord);
        }
      }
      const modalRaw = localStorage.getItem('modal_state');
      if (modalRaw) {
        const modalState = JSON.parse(modalRaw);
        if (modalState?.open && typeof modalState.accountNo === 'string') {
          if (typeof modalState.note === 'string' || Array.isArray(modalState.noteImages)) {
            saveRemarkDraft(
              modalState.accountNo,
              modalState.note ?? '',
              Array.isArray(modalState.noteImages) ? modalState.noteImages : []
            );
          }
          setPendingSelectedAccount(modalState.accountNo);
        }
      }
    } catch {
      localStorage.removeItem('home_state');
    }
    setRestored(true);
  }, [restored, records]);

  useEffect(() => {
    if (!pendingSelectedAccount) return;
    if (selectedRecord?.accountNo === pendingSelectedAccount) return;
    const record = records.find((item) => item.accountNo === pendingSelectedAccount);
    if (record) {
      setSelectedRecord(record);
      setPendingSelectedAccount('');
    }
  }, [pendingSelectedAccount, records, selectedRecord]);

  useEffect(() => {
    if (!selectedRecord) return;
    try {
      localStorage.setItem(
        'modal_state',
        JSON.stringify({
          open: true,
          accountNo: selectedRecord.accountNo,
          note: getRemarkDraft(selectedRecord.accountNo).note ?? '',
          noteImages: getRemarkDraft(selectedRecord.accountNo).noteImages ?? [],
        })
      );
    } catch {
      // ignore
    }
  }, [selectedRecord, getRemarkDraft]);

  useEffect(() => {
    if (!restored) return;
    const payload = {
      query,
      selectedSegment,
      mode,
      batching,
      showProcessed,
      processedQuery,
      selectedRecord: selectedRecord?.accountNo ?? '',
      selectedBatch: Array.from(selectedBatch),
    };
    try {
      localStorage.setItem('home_state', JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [query, selectedSegment, mode, batching, showProcessed, processedQuery, selectedRecord, selectedBatch, restored]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => {
      setIsDesktop(media.matches);
      if (media.matches) setMode('list');
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const toggleBatch = (record) => {
    setSelectedBatch((prev) => {
      const next = new Set(prev);
      if (next.has(record.accountNo)) next.delete(record.accountNo);
      else next.add(record.accountNo);
      return next;
    });
  };

  const handleBatchComplete = () => {
    if (selectedBatch.size === 0) return;
    filteredRecords.forEach((record) => {
      if (selectedBatch.has(record.accountNo)) {
        markProcessedOptimistic(record, '');
      }
    });
    setStatus(`批量完成 ${selectedBatch.size} 条`);
    setBatching(false);
    flushPendingProcessed();
  };

  const handleBatchToggleAll = () => {
    setSelectedBatch((prev) => {
      if (prev.size === filteredRecords.length) {
        return new Set();
      }
      return new Set(filteredRecords.map((record) => record.accountNo));
    });
  };

  const segmentOptions = useMemo(() => {
    const set = new Set();
    records.forEach((record) => {
      if (record.meterSegment) set.add(record.meterSegment);
    });
    return ['EI35全部段号', ...Array.from(set).sort()];
  }, [records]);

  const processedRecords = useMemo(() => {
    const list = records.filter((record) => processedMap[record.accountNo]);
    if (!processedQuery.trim()) return list;
    const pattern = buildAddressPattern(processedQuery.trim());
    if (!pattern) return list;
    return list.filter((record) => pattern.test(record.address || ''));
  }, [records, processedMap, processedQuery]);

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

  const handleMarkFromModal = async (note, noteImage) => {
    if (!selectedRecord) return;
    const result = markProcessedOptimistic(selectedRecord, note, noteImage);
    if (!result.ok) {
      setStatus(result.message || '标记失败');
      return;
    }
    setStatus('已标记为完成');
    setSelectedRecord(null);
    flushPendingProcessed();
  };

  const handleCardMark = async () => {
    if (!currentRecord) return;
    const result = markProcessedOptimistic(currentRecord, '');
    if (!result.ok) {
      setStatus(result.message || '标记失败');
      return;
    }
    setCompletedStack((prev) => [...prev, currentRecord.accountNo]);
    setStatus('已标记为完成');
    flushPendingProcessed();
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
        <div className="title-row">
          <h1>催费工作台</h1>
          <Link className="ghost back-link" to="/back">
            <span className="text-full">后台入口</span>
            <span className="text-short">后台</span>
          </Link>
        </div>
        <div className="header-right">
          <p className="muted">
            数据来源：{stats.sourceFile ? stats.sourceFile : '数据库导入'}，总计 {stats.total} 条，待催费 {stats.active} 条，已催费成功 {stats.asked} 条，已处理 {stats.processed} 条
          </p>
          {syncStatus === 'syncing' && (
            <p className="muted">离线备注同步中…</p>
          )}
          {syncStatus === 'error' && (
            <p className="muted">离线备注同步失败，稍后自动重试</p>
          )}
          {query.trim() && (
            <p className="muted search-result">搜索结果：{filteredRecords.length} 条</p>
          )}
          <div className="mode-controls">
            <button className="ghost" type="button" onClick={() => setBatching((prev) => !prev)}>
              <span className="text-full">{batching ? '取消批量' : '批量完成'}</span>
              <span className="text-short">{batching ? '取消' : '批量'}</span>
            </button>
            <button className="ghost" type="button" onClick={() => setShowProcessed(true)}>
              <span className="text-full">已处理名单</span>
              <span className="text-short">已处理</span>
            </button>
            <select
              className="segment-select"
              value={selectedSegment}
              onChange={(event) => setSelectedSegment(event.target.value)}
            >
              {segmentOptions.map((segment) => (
                <option key={segment} value={segment}>
                  {segment}
                </option>
              ))}
            </select>
            <input
              className="search"
              type="search"
            placeholder="搜索户号/户名/地址（- 可代替 1~5 个中文字）"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {!isDesktop && (
            <div className="mode-toggle">
              <button
                className={mode === 'list' ? 'active' : ''}
                type="button"
                onClick={() => setMode('list')}
              >
                <span className="text-full">列表模式</span>
                <span className="text-short">列表</span>
              </button>
              <button
                className={mode === 'card' ? 'active' : ''}
                type="button"
                onClick={() => setMode('card')}
              >
                <span className="text-full">卡片模式</span>
                <span className="text-short">卡片</span>
              </button>
            </div>
          )}
          </div>
        </div>
      </div>

      {status && <div className="status">{status}</div>}
      {loading && (
        <div className="status">
          <div>正在加载数据…</div>
          <div className="progress">
            <div className="progress-bar" style={{ width: `${loadProgress}%` }} />
          </div>
        </div>
      )}
      {error && <div className="status error">{error}</div>}

      {!loading && !error && mode === 'list' && (
        <div className="record-list">
          {batching && (
            <div className="batch-bar">
              <div>已选择 {selectedBatch.size} 条</div>
              <div className="batch-actions">
                <button className="ghost" type="button" onClick={handleBatchToggleAll}>
                  <span className="text-full">{selectedBatch.size === filteredRecords.length ? '取消全选' : '全选'}</span>
                  <span className="text-short">{selectedBatch.size === filteredRecords.length ? '取消' : '全选'}</span>
                </button>
                <button className="primary" type="button" onClick={handleBatchComplete}>
                  <span className="text-full">批量标记完成</span>
                  <span className="text-short">批量完成</span>
                </button>
              </div>
            </div>
          )}
          {filteredRecords.length === 0 && <div className="empty">暂无待催费记录</div>}
          {filteredRecords.map((record) => (
            <button
              key={record.accountNo}
              className="record-item"
              type="button"
              onClick={() => (batching ? toggleBatch(record) : setSelectedRecord(record))}
            >
              {batching && (
                <input
                  className="batch-checkbox"
                  type="checkbox"
                  checked={selectedBatch.has(record.accountNo)}
                  readOnly
                />
              )}
              <div>
                <div className="record-title">{safeText(record.address)}</div>
                <div className="record-sub">
                  {safeText(record.name)} · 户号 {safeText(record.accountNo)}
                </div>
              </div>
                <div className="record-amount">
                  <span>
                    欠费
                    {record.meterSegment && (
                      <span className="segment-inline">· {record.meterSegment}</span>
                    )}
                  </span>
                  <strong>{formatCurrency(record.arrears)}</strong>
                </div>
            </button>
          ))}
        </div>
      )}

      {!loading && !error && !isDesktop && mode === 'card' && (
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
        defaultNote={selectedRecord ? getRemarkDraft(selectedRecord.accountNo).note : ''}
        defaultNoteImages={selectedRecord ? getRemarkDraft(selectedRecord.accountNo).noteImages : []}
        onDraftChange={(note, images) => {
          if (!selectedRecord) return;
          saveRemarkDraft(selectedRecord.accountNo, note, images);
        }}
      />

      {showProcessed && (
        <div className="modal-backdrop" onClick={() => setShowProcessed(false)}>
          <div className="modal processed-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>已处理名单</h2>
                <p className="muted">可搜索地址并撤销已处理</p>
              </div>
              <button className="ghost" type="button" onClick={() => setShowProcessed(false)}>
                <span className="text-full">关闭</span>
                <span className="text-short">关</span>
              </button>
            </div>
            <div className="modal-body">
              <input
                className="search"
                type="search"
                placeholder="搜索地址（- 可代替 1~5 个中文字）"
                value={processedQuery}
                onChange={(event) => setProcessedQuery(event.target.value)}
              />
              <div className="record-list processed-list">
                {processedRecords.length === 0 && <div className="empty">暂无已处理记录</div>}
                {processedRecords.map((record) => (
                  <div key={record.accountNo} className="record-item processed-item">
                    <div>
                      <div className="record-title">{safeText(record.address)}</div>
                      <div className="record-sub">
                        {safeText(record.name)} · 户号 {safeText(record.accountNo)}
                      </div>
                    </div>
                    <button
                      className="primary ghost"
                      type="button"
                      onClick={() => unmarkProcessed(record.accountNo)}
                    >
                      撤销已处理
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
