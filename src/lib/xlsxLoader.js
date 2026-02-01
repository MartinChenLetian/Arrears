import * as XLSX from 'xlsx';

const HEADER_HINTS = ['户号', '户名', '催费电话', '用电地址', '欠费金额', '本月电费', '电费总和', '用户编号', '用户名称', '用户地址', '合计'];

const HEADER_MAP = {
  户号: 'accountNo',
  户名: 'name',
  催费电话: 'phone',
  用电地址: 'address',
  欠费金额: 'arrears',
  本月电费: 'currentFee',
  电费总和: 'totalFee',
  用户编号: 'accountNo',
  用户名称: 'name',
  用户地址: 'address',
  合计: 'totalFee',
};

function isHeaderRow(row) {
  if (!row || !row.length) return false;
  const rowText = row.map((cell) => String(cell ?? '').trim()).join(' ');
  return HEADER_HINTS.some((hint) => rowText.includes(hint));
}

function normalizeRow(row) {
  const safe = (value) => (value === null || value === undefined ? '' : String(value).trim());
  return {
    accountNo: safe(row[0]),
    name: safe(row[1]),
    phone: safe(row[2]),
    address: safe(row[3]),
    arrears: safe(row[4]),
    currentFee: safe(row[5]),
    totalFee: safe(row[6]),
  };
}

function normalizeRowWithHeader(row, headerIndexMap) {
  const safe = (value) => (value === null || value === undefined ? '' : String(value).trim());
  const record = {
    accountNo: '',
    name: '',
    phone: '',
    address: '',
    arrears: '',
    currentFee: '',
    totalFee: '',
  };

  Object.entries(headerIndexMap).forEach(([field, idx]) => {
    if (idx == null) return;
    record[field] = safe(row[idx]);
  });

  return record;
}

function findHeaderRow(rows, maxScan = 8) {
  const limit = Math.min(rows.length, maxScan);
  for (let i = 0; i < limit; i += 1) {
    if (isHeaderRow(rows[i])) return i;
  }
  return -1;
}

export async function parseXlsxFile(file) {
  if (!file) throw new Error('请选择 xlsx 文件');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: '',
  });

  const cleanedRows = rows.filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));
  const headerRowIndex = findHeaderRow(cleanedRows);
  const hasHeader = headerRowIndex >= 0;
  const startIndex = hasHeader ? headerRowIndex + 1 : 0;

  let headerIndexMap = null;
  if (hasHeader) {
    headerIndexMap = {};
    cleanedRows[headerRowIndex].forEach((cell, idx) => {
      const text = String(cell ?? '').trim();
      if (HEADER_MAP[text]) headerIndexMap[HEADER_MAP[text]] = idx;
      if (text === '1月' || text === '本月' || text === '当月电费') headerIndexMap.currentFee = idx;
    });
  }

  return cleanedRows
    .slice(startIndex)
    .map((row) => (headerIndexMap ? normalizeRowWithHeader(row, headerIndexMap) : normalizeRow(row)))
    .filter((record) => record.accountNo);
}
