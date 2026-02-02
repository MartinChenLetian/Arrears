import { useEffect, useMemo, useState } from 'react';
import { formatCurrency, safeText, splitPhones } from '../lib/format';

export default function RecordModal({
  record,
  isOpen,
  onClose,
  onMark,
  defaultNote = '',
  defaultNoteImage = '',
  onDraftChange,
}) {
  const [note, setNote] = useState(defaultNote);
  const [noteImage, setNoteImage] = useState(defaultNoteImage);
  const phones = useMemo(() => splitPhones(record?.phone), [record?.phone]);
  const [selectedPhone, setSelectedPhone] = useState(phones[0] ?? '');
  const callNumber = selectedPhone || phones[0] || '';
  const hasNumber = Boolean(callNumber);

  useEffect(() => {
    setNote(defaultNote);
    setSelectedPhone(phones[0] ?? '');
    setNoteImage(defaultNoteImage);
  }, [defaultNote, defaultNoteImage, phones, record?.accountNo]);

  if (!isOpen || !record) return null;

  const handleClose = () => {
    setNote(defaultNote);
    setNoteImage(defaultNoteImage);
    onClose();
  };

  const handleMark = async () => {
    await onMark?.(note, noteImage);
  };

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      setNoteImage(result);
      onDraftChange?.(note, result);
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
            关闭
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
                onDraftChange?.(event.target.value, noteImage);
              }}
            />
          </label>
          <div className="note-upload">
            <span className="label">备注图片</span>
            <input type="file" accept="image/*" onChange={handleImageChange} />
            {noteImage && (
              <div className="note-preview">
                <img src={noteImage} alt="备注图片" />
                <button
                  className="ghost"
                  type="button"
                  onClick={() => {
                    setNoteImage('');
                    onDraftChange?.(note, '');
                  }}
                >
                  移除图片
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <a
            className={`primary ${!hasNumber ? 'disabled' : ''}`}
            href={hasNumber ? `tel:${callNumber}` : undefined}
            onClick={(event) => {
              if (!hasNumber) event.preventDefault();
            }}
          >
            开始催费
          </a>
          <button className="primary ghost" type="button" onClick={handleMark}>
            标记完成
          </button>
        </div>
      </div>
    </div>
  );
}
