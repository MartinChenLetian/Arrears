export function parseNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^0-9.-]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function formatCurrency(value) {
  const num = parseNumber(value);
  if (num === null) {
    return value === null || value === undefined || value === '' ? '—' : String(value);
  }
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 2,
  }).format(num);
}

export function splitPhones(value) {
  if (!value) return [];
  const raw = String(value)
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return [];
  const parts = raw.split(/[\/，,;；、\s]+/).map((part) => part.trim());
  return Array.from(new Set(parts.filter(Boolean)));
}

export function safeText(value) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

export function buildAddressPattern(query) {
  if (!query) return null;
  const trimmed = String(query).trim();
  if (!trimmed) return null;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped.replace(/-/g, '[\\u4e00-\\u9fa5]{1,5}');
  return new RegExp(pattern, 'i');
}
