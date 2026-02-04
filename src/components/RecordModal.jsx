import { useEffect, useMemo, useState } from 'react';
import { formatCurrency, safeText, splitPhones } from '../lib/format';

export default function RecordModal({
  record,
  isOpen,
  onClose,
  onMark,
  defaultNote = '',
  defaultNoteImages = [],
  onDraftChange,
}) {
  const [note, setNote] = useState(defaultNote);
  const [noteImages, setNoteImages] = useState(defaultNoteImages);
  const phones = useMemo(() => splitPhones(record?.phone), [record?.phone]);
  const [selectedPhone, setSelectedPhone] = useState(phones[0] ?? '');
  const callNumber = selectedPhone || phones[0] || '';
  const hasNumber = Boolean(callNumber);

  useEffect(() => {
    setNote(defaultNote);
    setSelectedPhone(phones[0] ?? '');
    setNoteImages(defaultNoteImages);
  }, [defaultNote, defaultNoteImages, phones, record?.accountNo]);

  if (!isOpen || !record) return null;

  const handleClose = () => {
    setNote(defaultNote);
    setNoteImages(defaultNoteImages);
    try {
      localStorage.setItem('modal_state', JSON.stringify({ open: false }));
    } catch {
      // ignore
    }
    onClose();
  };

  const handleMark = async () => {
    await onMark?.(note, noteImages);
  };

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (noteImages.length >= 5) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const next = [...noteImages, result].slice(0, 5);
      setNoteImages(next);
      onDraftChange?.(note, next);
      try {
        localStorage.setItem(
          'modal_state',
          JSON.stringify({
            open: true,
            accountNo: record?.accountNo ?? '',
            note,
            noteImages: next,
          })
        );
      } catch {
        // ignore
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{safeText(record.name)}</h2>
            <p>户号：{safeText(record.accountNo)}</p>
          </div>
          <button className="ghost" type="button" onClick={handleClose}>
            <span className="text-full">关闭</span>
            <span className="text-short">关</span>
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-grid">
            <div>
              <span className="label">用电地址</span>
              <div>{safeText(record.address)}</div>
            </div>
            <div>
              <span className="label">欠费金额</span>
              <div>{formatCurrency(record.arrears)}</div>
            </div>
            <div>
              <span className="label">本月电费</span>
              <div>{formatCurrency(record.currentFee)}</div>
            </div>
            <div>
              <span className="label">电费总和</span>
              <div>{formatCurrency(record.totalFee)}</div>
            </div>
          </div>

          <div className="phone-select">
            <span className="label">催费电话</span>
            {phones.length > 1 ? (
              <div className="phone-options">
                {phones.map((phone) => (
                  <label key={phone}>
                    <input
                      type="radio"
                      name="phone"
                      value={phone}
                      checked={selectedPhone === phone}
                      onChange={() => setSelectedPhone(phone)}
                    />
                    {phone}
                  </label>
                ))}
              </div>
            ) : (
              <div>{safeText(phones[0] ?? record.phone)}</div>
            )}
          </div>

          <label className="note-input">
            <span className="label">标记备注</span>
            <input
              type="text"
              placeholder="例如：已电话联系，约定 2 月 5 日缴费"
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                onDraftChange?.(event.target.value, noteImages);
                try {
                  localStorage.setItem(
                    'modal_state',
                    JSON.stringify({
                      open: true,
                      accountNo: record?.accountNo ?? '',
                      note: event.target.value,
                      noteImages,
                    })
                  );
                } catch {
                  // ignore
                }
              }}
            />
          </label>
          <div className="note-upload">
            <span className="label">备注图片</span>
            <div className="note-preview-grid">
              {noteImages.map((img, idx) => (
                <div key={`${img.slice(0, 12)}-${idx}`} className="note-preview-item">
                  <img src={img} alt={`备注图片${idx + 1}`} />
                    <button
                      className="ghost"
                      type="button"
                      onClick={() => {
                        const next = noteImages.filter((_, index) => index !== idx);
                        setNoteImages(next);
                        onDraftChange?.(note, next);
                      }}
                    >
                      <span className="text-full">移除</span>
                      <span className="text-short">删</span>
                    </button>
                </div>
              ))}
              {noteImages.length < 5 && (
                <label className="image-tile">
                  <input type="file" accept="image/*" onChange={handleImageChange} />
                  <span className="plus">＋</span>
                </label>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button
            className="primary"
            type="button"
            onClick={handleMark}
          >
            <span className="text-full">标记完成</span>
            <span className="text-short">完成</span>
          </button>
          <a
            className={`ghost ${!hasNumber ? 'disabled' : ''}`}
            href={hasNumber ? `tel:${callNumber}` : undefined}
            onClick={(event) => {
              if (!hasNumber) event.preventDefault();
            }}
          >
            <span className="text-full">开始催费</span>
            <span className="text-short">催费</span>
          </a>
        </div>
      </div>
    </div>
  );
}
