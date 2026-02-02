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

  useEffect(() => {
    let isActive = true;

    async function loadAll() {
      try {
        setLoading(true);
        await refreshRecords();
        await refreshProcessed();
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

  async function refreshRecords() {
    if (!hasSupabaseConfig) {
      setError('Supabase 未配置，请检查 .env');
      return;
    }

    const { data, error: fetchError } = await supabase
      .from('billing_records')
      .select('account_no, name, phone, address, arrears, current_fee, total_fee, asked, meter_segment, source_file, imported_at')
      .order('account_no', { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
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
    const latest = mapped
      .filter((item) => item.importedAt)
      .sort((a, b) => String(b.importedAt).localeCompare(String(a.importedAt)))[0];
    setSourceFile(latest?.sourceFile ?? '数据库导入');
  }

  async function refreshProcessed() {
    if (!hasSupabaseConfig) {
      setError('Supabase 未配置，请检查 .env');
      return;
    }
    const { data, error: fetchError } = await supabase
      .from('processed_accounts')
      .select('account_no, note, note_image, processed_at');

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    const nextMap = {};
    (data ?? []).forEach((row) => {
      nextMap[row.account_no] = {
        note: row.note ?? '',
        noteImage: row.note_image ?? '',
        processedAt: row.processed_at,
      };
    });
    setProcessedMap(nextMap);
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

  function saveRemarkDraft(accountNo, note, noteImage) {
    if (!accountNo) return;
    const cache = getRemarkCache();
    cache[accountNo] = {
      note: note ?? '',
      noteImage: noteImage ?? '',
      updatedAt: new Date().toISOString(),
    };
    setRemarkCache(cache);
  }

  function getRemarkDraft(accountNo) {
    const cache = getRemarkCache();
    return cache[accountNo] || { note: '', noteImage: '' };
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
        note_image: getRemarkDraft(record.accountNo).noteImage ?? '',
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
    supabase
      .from('processed_accounts')
      .upsert(pending, { onConflict: 'account_no' })
      .then(({ error: upsertError }) => {
        if (upsertError) {
          setError(upsertError.message);
          setSyncStatus('error');
          return;
        }
        localStorage.removeItem('processed_pending');
        setSyncStatus('ok');
        refreshProcessed();
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
      note_image: getRemarkDraft(record.accountNo).noteImage ?? '',
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
        noteImage: payload.note_image ?? '',
        processedAt: payload.processed_at,
      },
    }));

    return { ok: true };
  }

  function markProcessedOptimistic(record, note, noteImage) {
    if (!record?.accountNo) return { ok: false, message: '缺少户号' };
    if (!hasSupabaseConfig) return { ok: false, message: 'Supabase 未配置，请检查 .env' };

    const processedAt = new Date().toISOString();
    if (note !== undefined || noteImage !== undefined) {
      saveRemarkDraft(record.accountNo, note ?? '', noteImage ?? '');
    }
    setProcessedMap((prev) => ({
      ...prev,
      [record.accountNo]: { note: note ?? '', noteImage: noteImage ?? '', processedAt },
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
          note_image: noteImage ?? getRemarkDraft(record.accountNo).noteImage ?? '',
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
