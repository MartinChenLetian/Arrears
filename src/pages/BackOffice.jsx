import { useMemo, useState } from 'react';
import { buildAddressPattern, formatCurrency, parseNumber, safeText } from '../lib/format';
import { useRecords } from '../context/RecordsContext';
import { parseXlsxFile } from '../lib/xlsxLoader';
import * as XLSX from 'xlsx';
import { hasSupabaseConfig, supabase } from '../lib/supabase';

export default function BackOffice() {
  const { records, processedMap, loading, error, markProcessed, unmarkProcessed, refreshRecords } = useRecords();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [noteDrafts, setNoteDrafts] = useState({});
  const [importing, setImporting] = useState(false);
  const [importFileName, setImportFileName] = useState('');

  const filteredRecords = useMemo(() => {
    if (!query.trim()) return records;
    const term = query.trim();
    const pattern = buildAddressPattern(term);
    return records.filter((record) => {
      return (
        record.accountNo.includes(term) ||
        record.name.includes(term) ||
        (pattern ? pattern.test(record.address || '') : record.address.includes(term))
      );
    });
  }, [query, records]);

  const handleMark = async (record) => {
    const note = noteDrafts[record.accountNo] || '';
    const result = await markProcessed(record, note);
    if (!result.ok) {
      setStatus(result.message || '标记失败');
      return;
    }
    setStatus('已更新');
  };

  const handleUnmark = async (accountNo) => {
    const result = await unmarkProcessed(accountNo);
    if (!result.ok) {
      setStatus(result.message || '取消标记失败');
      return;
    }
    setStatus('已取消标记');
  };

  const handleAsked = async (record) => {
    if (!record?.accountNo) return;
    const { error: updateError } = await supabase
      .from('billing_records')
      .update({ asked: true })
      .eq('account_no', record.accountNo);
    if (updateError) {
      setStatus(updateError.message || '更新失败');
      return;
    }
    setStatus('已标记为催费成功');
    await refreshRecords();
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!hasSupabaseConfig) {
      setStatus('Supabase 未配置，请检查 .env');
      return;
    }
    setImporting(true);
    setStatus('');
    try {
      const { data: previousData, error: previousError } = await supabase
        .from('billing_records')
        .select('account_no, name, phone, address, meter_segment, arrears, current_fee, total_fee');
      if (previousError) throw previousError;

      const previousAccounts = new Set((previousData ?? []).map((row) => row.account_no));

      const { error: clearProcessedError } = await supabase
        .from('processed_accounts')
        .delete()
        .neq('account_no', '');
      if (clearProcessedError) throw clearProcessedError;

      const { error: clearBillingError } = await supabase
        .from('billing_records')
        .delete()
        .neq('account_no', '');
      if (clearBillingError) throw clearBillingError;

      const parsed = await parseXlsxFile(file);
      if (parsed.length === 0) {
        setStatus('未解析到任何记录');
        return;
      }
      const payload = parsed.map((record) => ({
        account_no: record.accountNo,
        name: record.name,
        phone: record.phone,
        address: record.address,
        arrears: parseNumber(record.arrears),
        current_fee: parseNumber(record.currentFee),
        total_fee: parseNumber(record.totalFee),
        asked: false,
        meter_segment: record.meterSegment || null,
        source_file: file.name,
        imported_at: new Date().toISOString(),
      }));

      const chunkSize = 500;
      for (let i = 0; i < payload.length; i += chunkSize) {
        const chunk = payload.slice(i, i + chunkSize);
        const { error: upsertError } = await supabase
          .from('billing_records')
          .upsert(chunk, { onConflict: 'account_no' });
        if (upsertError) throw upsertError;
      }

      const currentAccounts = new Set(payload.map((row) => row.account_no));
      const paidRecords = (previousData ?? []).filter((row) => !currentAccounts.has(row.account_no));

      if (paidRecords.length > 0) {
        const exportRows = paidRecords.map((row) => ({
          户号: row.account_no,
          户名: row.name ?? '',
          催费电话: row.phone ?? '',
          用电地址: row.address ?? '',
          抄表段号: row.meter_segment ?? '',
          欠费金额: row.arrears ?? '',
          本月电费: row.current_fee ?? '',
          电费总和: row.total_fee ?? '',
        }));
        const worksheet = XLSX.utils.json_to_sheet(exportRows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, '已付电费');
        const arrayBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
        const blob = new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `已付电费_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(link.href);
      }

      setImportFileName(file.name);
      setStatus(`已导入 ${payload.length} 条记录${paidRecords.length > 0 ? `，已生成差户 ${paidRecords.length} 条` : ''}`);
      await refreshRecords();
    } catch (importError) {
      setStatus(importError?.message || '导入失败');
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>后台标记</h1>
          <p className="muted">在此手动标记已处理记录，主催费页将自动隐藏。</p>
        </div>
        <div className="backoffice-actions">
          <label className="file-upload">
            <input type="file" accept=".xlsx" onChange={handleImport} disabled={importing} />
            {importing ? '正在导入…' : '导入 xlsx'}
          </label>
          <input
            className="search"
            type="search"
            placeholder="搜索户号 / 户名 / 地址"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      {status && <div className="status">{status}</div>}
      {importFileName && (
        <div className="status">最近导入：{importFileName}</div>
      )}
      {loading && <div className="status">正在加载数据…</div>}
      {error && <div className="status error">{error}</div>}

      {!loading && !error && (
        <div className="record-table">
          {filteredRecords.length === 0 && <div className="empty">没有匹配记录</div>}
          {filteredRecords.map((record) => {
            const processed = processedMap[record.accountNo];
            const asked = Boolean(record.asked);
            return (
              <div
                key={record.accountNo}
                className={`record-row ${processed || asked ? 'processed' : ''}`}
              >
                <div className="row-main">
                  <div className="record-title">{safeText(record.address)}</div>
                  <div className="record-sub">
                    {safeText(record.name)} · 户号 {safeText(record.accountNo)}
                  </div>
                  <div className="record-sub">
                    欠费 {formatCurrency(record.arrears)} · 总额 {formatCurrency(record.totalFee)}
                  </div>
                </div>
                <div className="row-actions">
                  {processed || asked ? (
                    <>
                      <div className="badge success">{asked ? '催费成功' : '已处理'}</div>
                      {processed && <div className="note-text">备注：{processed.note || '—'}</div>}
                      {processed && (
                        <button className="ghost" type="button" onClick={() => handleUnmark(record.accountNo)}>
                          取消标记
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button className="ghost" type="button" onClick={() => handleAsked(record)}>
                        催费成功
                      </button>
                      <input
                        className="note-inline"
                        type="text"
                        placeholder="备注"
                        value={noteDrafts[record.accountNo] || ''}
                        onChange={(event) =>
                          setNoteDrafts((prev) => ({
                            ...prev,
                            [record.accountNo]: event.target.value,
                          }))
                        }
                      />
                      <button className="primary" type="button" onClick={() => handleMark(record)}>
                        标记完成
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
