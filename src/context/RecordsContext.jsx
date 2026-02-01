import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { hasSupabaseConfig, supabase } from '../lib/supabase';

const RecordsContext = createContext(null);

export function RecordsProvider({ children }) {
  const [records, setRecords] = useState([]);
  const [processedMap, setProcessedMap] = useState({});
  const [sourceFile, setSourceFile] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        handleFocus();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      isActive = false;
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
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
      .select('account_no, note, processed_at');

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    const nextMap = {};
    (data ?? []).forEach((row) => {
      nextMap[row.account_no] = {
        note: row.note ?? '',
        processedAt: row.processed_at,
      };
    });
    setProcessedMap(nextMap);
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
        processedAt: payload.processed_at,
      },
    }));

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
    markProcessed,
    unmarkProcessed,
    refreshProcessed,
    refreshRecords,
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
