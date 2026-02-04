import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildAddressPattern, formatCurrency, parseNumber, safeText } from '../lib/format';
import { useRecords } from '../context/RecordsContext';
import { parseXlsxFile } from '../lib/xlsxLoader';
import * as XLSX from 'xlsx';
import { NOTE_BUCKET, hasSupabaseConfig, supabase } from '../lib/supabase';

export default function BackOffice() {
  const { records, processedMap, loading, error, markProcessed, unmarkProcessed, refreshRecords } = useRecords();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [noteDrafts, setNoteDrafts] = useState({});
  const [importing, setImporting] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [migrating, setMigrating] = useState(false);
  const [migrateProgress, setMigrateProgress] = useState({ total: 0, done: 0 });

  const loadMigrateState = () => {
    try {
      const raw = localStorage.getItem('migrate_state');
      return raw ? JSON.parse(raw) : null;
    } catch {
      localStorage.removeItem('migrate_state');
      return null;
    }
  };

  const saveMigrateState = (state) => {
    try {
      localStorage.setItem('migrate_state', JSON.stringify(state));
    } catch {
      // ignore
    }
  };

  const clearMigrateState = () => {
    localStorage.removeItem('migrate_state');
  };

  const buildExportRows = (list, urlMap = {}) => {
    return list.map((record) => {
      const processed = processedMap[record.accountNo];
      const done = Boolean(processed) || Boolean(record.asked);
      const paths = Array.isArray(urlMap[record.accountNo])
        ? urlMap[record.accountNo]
        : Array.isArray(processed?.noteImageUrls)
          ? processed.noteImageUrls
          : [];
      const rawImageText = paths.length
        ? paths.map((path) => `private:${path}`).join('\n')
        : '';
      const imageText =
        rawImageText.length > 30000
          ? `链接过长未导出（${urls.length} 张）`
          : rawImageText;
      return {
        户号: record.accountNo,
        户名: record.name,
        抄表段号: record.meterSegment || '',
        催费电话: record.phone,
        地址: record.address,
        欠费金额: record.arrears ?? '',
        当月电费: record.currentFee ?? '',
        合计: record.totalFee ?? '',
        备注: processed?.note ?? '',
        照片数量: paths.length,
        备注照片: imageText,
        完成: done ? '✅' : '❌',
      };
    });
  };

  const downloadExport = (rows, filename) => {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '催费汇总');
    const arrayBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  };

  const fetchNoteUrls = async (accountNos) => {
    if (!accountNos.length) return {};
    const map = {};
    const chunkSize = 200;
    for (let i = 0; i < accountNos.length; i += chunkSize) {
      const chunk = accountNos.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from('processed_accounts')
        .select('account_no, note_image_urls')
        .in('account_no', chunk);
      if (error) continue;
      (data ?? []).forEach((row) => {
        if (Array.isArray(row.note_image_urls)) {
          map[row.account_no] = row.note_image_urls;
        }
      });
    }
    return map;
  };

  const enrichWithSignedUrls = async (rows) => {
    const updated = [];
    for (const row of rows) {
      const raw = row['备注照片'] || '';
      if (!raw || typeof raw !== 'string') {
        updated.push(row);
        continue;
      }
      const paths = raw
        .split('\n')
        .map((item) => item.replace(/^private:/, '').trim())
        .filter(Boolean);
      if (!paths.length) {
        updated.push(row);
        continue;
      }
      const { data, error } = await supabase.storage
        .from(NOTE_BUCKET)
        .createSignedUrls(paths, 3600);
      if (error || !data) {
        updated.push(row);
        continue;
      }
      const signed = data.map((item) => item.signedUrl).filter(Boolean);
      updated.push({
        ...row,
        备注照片: signed.join('\n'),
      });
    }
    return updated;
  };

  const handleExport = async () => {
    const urlMap = await fetchNoteUrls(filteredRecords.map((r) => r.accountNo));
    const rows = buildExportRows(filteredRecords, urlMap);
    const withUrls = await enrichWithSignedUrls(rows);
    downloadExport(withUrls, `催费导出_筛选_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleExportAll = async () => {
    const urlMap = await fetchNoteUrls(records.map((r) => r.accountNo));
    const rows = buildExportRows(records, urlMap);
    const withUrls = await enrichWithSignedUrls(rows);
    downloadExport(withUrls, `催费导出_全部_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleMigrateImages = async () => {
    if (!hasSupabaseConfig) {
      setStatus('Supabase 未配置，请检查 .env');
      return;
    }
    setMigrating(true);
    setStatus('');
    try {
      const { data, error } = await supabase
        .from('processed_accounts')
        .select('account_no, note_images, note_image_urls')
        .not('note_images', 'is', null);
      if (error) throw error;

      const rows = (data ?? []).filter(
        (row) => Array.isArray(row.note_images) && row.note_images.length > 0
      );
      const resume = loadMigrateState();
      const total = rows.reduce((sum, row) => sum + (row.note_images?.length || 0), 0);
      const doneBase = rows.reduce((sum, row) => sum + (row.note_image_urls?.length || 0), 0);
      setMigrateProgress({ total, done: doneBase });

      for (let r = 0; r < rows.length; r += 1) {
        const row = rows[r];
        const accountNo = row.account_no;
        const images = Array.isArray(row.note_images) ? row.note_images : [];
        if (!accountNo || images.length === 0) continue;

        const existingUrls = Array.isArray(row.note_image_urls) ? row.note_image_urls : [];
        let startIdx = 0;
        if (resume?.accountNo === accountNo && Number.isInteger(resume.imgIndex)) {
          startIdx = resume.imgIndex;
        }

        const urls = [...existingUrls];
        for (let i = startIdx; i < images.length; i += 1) {
          const img = images[i];
          if (!img || typeof img !== 'string') continue;
          if (!img.startsWith('data:')) {
            if (!urls.includes(img)) urls.push(img);
            continue;
          }
          const res = await fetch(img);
          const blob = await res.blob();
          const ext = blob.type.split('/')[1] || 'jpg';
          const path = `${accountNo}/${Date.now()}_${i}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from(NOTE_BUCKET)
            .upload(path, blob, { upsert: true, contentType: blob.type });
          if (uploadError) throw uploadError;
          urls.push(path);
          setMigrateProgress((prev) => ({ total: prev.total, done: prev.done + 1 }));
          saveMigrateState({ accountNo, imgIndex: i + 1 });
        }

        await supabase
          .from('processed_accounts')
          .update({ note_image_urls: urls, note_images: [] })
          .eq('account_no', accountNo);
        saveMigrateState({ accountNo: '', imgIndex: 0 });
      }

      clearMigrateState();
      setStatus('迁移完成（私有桶路径已写入，旧图片已清空）');
    } catch (err) {
      setStatus(err?.message || '迁移失败');
    } finally {
      setMigrating(false);
    }
  };

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

      const deduped = [];
      const seen = new Set();
      payload.forEach((row) => {
        if (seen.has(row.account_no)) return;
        seen.add(row.account_no);
        deduped.push(row);
      });

      const chunkSize = 500;
      for (let i = 0; i < deduped.length; i += chunkSize) {
        const chunk = deduped.slice(i, i + chunkSize);
        const { error: upsertError } = await supabase
          .from('billing_records')
          .upsert(chunk, { onConflict: 'account_no' });
        if (upsertError) throw upsertError;
      }

      const currentAccounts = new Set(deduped.map((row) => row.account_no));
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
      setStatus(`已导入 ${deduped.length} 条记录${paidRecords.length > 0 ? `，已生成差户 ${paidRecords.length} 条` : ''}`);
      localStorage.setItem('records_dirty', 'true');
      localStorage.removeItem('records_cache');
      localStorage.removeItem('processed_cache');
      localStorage.removeItem('remark_cache');
      await refreshRecords(true);
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
        <div className="title-row">
          <h1>后台标记</h1>
          <Link className="ghost back-link" to="/">
            <span className="text-full">返回工作台</span>
            <span className="text-short">返回</span>
          </Link>
        </div>
        <p className="muted">在此手动标记已处理记录，主催费页将自动隐藏。</p>
        <div className="backoffice-actions">
          <button className="ghost" type="button" onClick={handleMigrateImages} disabled={migrating}>
            <span className="text-full">{migrating ? '迁移中…' : '迁移历史图片'}</span>
            <span className="text-short">{migrating ? '迁移中' : '迁移'}</span>
          </button>
          <button className="ghost" type="button" onClick={handleExportAll}>
            <span className="text-full">全量导出</span>
            <span className="text-short">全量</span>
          </button>
          <button className="ghost" type="button" onClick={handleExport}>
            <span className="text-full">导出筛选</span>
            <span className="text-short">筛选</span>
          </button>
          <label className="file-upload">
            <input type="file" accept=".xlsx" onChange={handleImport} disabled={importing} />
            <span className="text-full">{importing ? '正在导入…' : '导入 xlsx'}</span>
            <span className="text-short">{importing ? '导入中' : '导入'}</span>
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
      {migrating && (
        <div className="status">
          <div>迁移图片中… {migrateProgress.done}/{migrateProgress.total}</div>
          <div className="progress">
            <div
              className="progress-bar"
              style={{
                width: migrateProgress.total
                  ? `${Math.round((migrateProgress.done / migrateProgress.total) * 100)}%`
                  : '0%',
              }}
            />
          </div>
        </div>
      )}
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
                          <span className="text-full">取消标记</span>
                          <span className="text-short">取消</span>
                      </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button className="ghost" type="button" onClick={() => handleAsked(record)}>
                        <span className="text-full">催费成功</span>
                        <span className="text-short">成功</span>
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
                        <span className="text-full">标记完成</span>
                        <span className="text-short">完成</span>
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
