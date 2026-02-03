import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { hasSupabaseConfig, supabase } from '../lib/supabase';

const RecordsContext = createContext(null);

export function RecordsProvider({ children }) {
  const [records, setRecords] = useState([]);
  const [processedMap, setProcessedMap] = useState({});
  const [sourceFile, setSourceFile] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncStatus, setSyncStatus] = useState('idle');
  const [usingCache, setUsingCache] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);

  useEffect(() => {
    let isActive = true;

    async function loadAll() {
      try {
        setLoading(true);
        setLoadProgress(10);
        await refreshRecords();
        setLoadProgress(60);
        await refreshProcessed();
        setLoadProgress(100);
      } catch (err) {
        if (!isActive) return;
        setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        if (isActive) setLoading(false);
      }
    }

    loadAll();

    const handleFocus = () => {
      refreshRecords();
      refreshProcessed();
      flushPendingProcessed();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        handleFocus();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleFocus);
    return () => {
      isActive = false;
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleFocus);
    };
  }, []);

  function readCache(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      localStorage.removeItem(key);
      return null;
    }
  }

  function writeCache(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn('Failed to persist cache', err);
    }
  }

  async function refreshRecords(force = false) {
    if (!hasSupabaseConfig) {
      setError('Supabase 未配置，请检查 .env');
      return;
    }

    const isDirty = localStorage.getItem('records_dirty') === 'true';
    const cached = readCache('records_cache');
    if (!force && !isDirty && cached?.length) {
      setUsingCache(true);
      setRecords(cached);
      const latest = cached
        .filter((item) => item.importedAt)
        .sort((a, b) => String(b.importedAt).localeCompare(String(a.importedAt)))[0];
      setSourceFile(latest?.sourceFile ?? '数据库导入');
      return;
    }

    setUsingCache(false);

    let data;
    try {
      const res = await supabase
        .from('billing_records')
        .select('account_no, name, phone, address, arrears, current_fee, total_fee, asked, meter_segment, source_file, imported_at')
        .order('account_no', { ascending: true });
      data = res.data;
      if (res.error) {
        setError(res.error.message);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
      return;
    }

    const mapped = (data ?? []).map((row) => ({
      accountNo: row.account_no ?? '',
      name: row.name ?? '',
      phone: row.phone ?? '',
      address: row.address ?? '',
      arrears: row.arrears ?? '',
      currentFee: row.current_fee ?? '',
      totalFee: row.total_fee ?? '',
      asked: row.asked ?? false,
      meterSegment: row.meter_segment ?? '',
      sourceFile: row.source_file ?? '',
      importedAt: row.imported_at ?? '',
    }));

    setRecords(mapped);
    writeCache('records_cache', mapped);
    localStorage.removeItem('records_dirty');
    const latest = mapped
      .filter((item) => item.importedAt)
      .sort((a, b) => String(b.importedAt).localeCompare(String(a.importedAt)))[0];
    setSourceFile(latest?.sourceFile ?? '数据库导入');
  }

  async function refreshProcessed(force = false) {
    if (!hasSupabaseConfig) {
      setError('Supabase 未配置，请检查 .env');
      return;
    }
    const isDirty = localStorage.getItem('records_dirty') === 'true';
    const cached = readCache('processed_cache');
    if (!force && !isDirty && cached && Object.keys(cached).length) {
      setProcessedMap(cached);
      return;
    }

    let data;
    try {
      const res = await supabase
        .from('processed_accounts')
        .select('account_no, note, note_images, processed_at');
      data = res.data;
      if (res.error) {
        setError(res.error.message);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
      return;
    }

    const nextMap = {};
    (data ?? []).forEach((row) => {
      nextMap[row.account_no] = {
        note: row.note ?? '',
        noteImages: Array.isArray(row.note_images) ? row.note_images : [],
        processedAt: row.processed_at,
      };
    });
    setProcessedMap(nextMap);
    writeCache('processed_cache', nextMap);
  }

  function getRemarkCache() {
    try {
      const raw = localStorage.getItem('remark_cache');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function setRemarkCache(next) {
    try {
      localStorage.setItem('remark_cache', JSON.stringify(next));
    } catch (err) {
      console.warn('Failed to persist remark cache', err);
    }
  }

  function saveRemarkDraft(accountNo, note, noteImages) {
    if (!accountNo) return;
    const cache = getRemarkCache();
    cache[accountNo] = {
      note: note ?? '',
      noteImages: Array.isArray(noteImages) ? noteImages : [],
      updatedAt: new Date().toISOString(),
    };
    setRemarkCache(cache);
  }

  function getRemarkDraft(accountNo) {
    const cache = getRemarkCache();
    return cache[accountNo] || { note: '', noteImages: [] };
  }

  function enqueueLocalProcessed(record, note) {
    try {
      const key = 'processed_pending';
      const raw = localStorage.getItem(key);
      const list = raw ? JSON.parse(raw) : [];
      list.push({
        account_no: record.accountNo,
        name: record.name,
        phone: record.phone,
        address: record.address,
        note: note ?? '',
        note_images: getRemarkDraft(record.accountNo).noteImages ?? [],
        processed_at: new Date().toISOString(),
      });
      localStorage.setItem(key, JSON.stringify(list));
    } catch (err) {
      console.warn('Failed to persist pending processed item', err);
    }
  }

  function flushPendingProcessed() {
    if (!hasSupabaseConfig) return;
    let pending = [];
    try {
      const raw = localStorage.getItem('processed_pending');
      pending = raw ? JSON.parse(raw) : [];
    } catch {
      pending = [];
    }
    if (!pending.length) return;
    setSyncStatus('syncing');
    const deduped = [];
    const seen = new Set();
    pending.forEach((item) => {
      if (seen.has(item.account_no)) return;
      seen.add(item.account_no);
      deduped.push(item);
    });
    supabase
      .from('processed_accounts')
      .upsert(deduped, { onConflict: 'account_no' })
      .then(({ error: upsertError }) => {
        if (upsertError) {
          setError(upsertError.message);
          setSyncStatus('error');
          return;
        }
        localStorage.removeItem('processed_pending');
        setSyncStatus('ok');
        refreshProcessed(true);
      });
  }

  async function markProcessed(record, note) {
    if (!record?.accountNo) return { ok: false, message: '缺少户号' };
    if (!hasSupabaseConfig) return { ok: false, message: 'Supabase 未配置，请检查 .env' };

    const payload = {
      account_no: record.accountNo,
      name: record.name,
      phone: record.phone,
      address: record.address,
      note: note ?? '',
      note_images: getRemarkDraft(record.accountNo).noteImages ?? [],
      processed_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from('processed_accounts')
      .upsert(payload, { onConflict: 'account_no' });

    if (upsertError) {
      return { ok: false, message: upsertError.message };
    }

    setProcessedMap((prev) => ({
      ...prev,
      [record.accountNo]: {
        note: note ?? '',
        noteImages: payload.note_images ?? [],
        processedAt: payload.processed_at,
      },
    }));

    return { ok: true };
  }

  function markProcessedOptimistic(record, note, noteImages) {
    if (!record?.accountNo) return { ok: false, message: '缺少户号' };
    if (!hasSupabaseConfig) return { ok: false, message: 'Supabase 未配置，请检查 .env' };

    const processedAt = new Date().toISOString();
    if (note !== undefined || noteImages !== undefined) {
      saveRemarkDraft(record.accountNo, note ?? '', noteImages ?? []);
    }
    setProcessedMap((prev) => ({
      ...prev,
      [record.accountNo]: { note: note ?? '', noteImages: noteImages ?? [], processedAt },
    }));
    enqueueLocalProcessed(record, note);

    supabase
      .from('processed_accounts')
      .upsert(
        {
          account_no: record.accountNo,
          name: record.name,
          phone: record.phone,
          address: record.address,
          note: note ?? '',
          note_images: noteImages ?? getRemarkDraft(record.accountNo).noteImages ?? [],
          processed_at: processedAt,
        },
        { onConflict: 'account_no' }
      )
      .then(({ error: upsertError }) => {
        if (upsertError) setError(upsertError.message);
      });

    return { ok: true };
  }

  async function unmarkProcessed(accountNo) {
    if (!accountNo) return { ok: false, message: '缺少户号' };
    if (!hasSupabaseConfig) return { ok: false, message: 'Supabase 未配置，请检查 .env' };

    const { error: deleteError } = await supabase
      .from('processed_accounts')
      .delete()
      .eq('account_no', accountNo);

    if (deleteError) {
      return { ok: false, message: deleteError.message };
    }

    setProcessedMap((prev) => {
      const next = { ...prev };
      delete next[accountNo];
      return next;
    });

    return { ok: true };
  }

  const activeRecords = useMemo(
    () => records.filter((record) => !processedMap[record.accountNo] && !record.asked),
    [records, processedMap]
  );

  const value = {
    records,
    activeRecords,
    processedMap,
    sourceFile,
    loading,
    error,
    syncStatus,
    loadProgress,
    markProcessed,
    markProcessedOptimistic,
    unmarkProcessed,
    refreshProcessed,
    refreshRecords,
    flushPendingProcessed,
    saveRemarkDraft,
    getRemarkDraft,
  };

  return <RecordsContext.Provider value={value}>{children}</RecordsContext.Provider>;
}

export function useRecords() {
  const context = useContext(RecordsContext);
  if (!context) {
    throw new Error('useRecords must be used within RecordsProvider');
  }
  return context;
}
