import React, { useCallback, useRef, useState } from 'react';
import { assertFileSizeOk } from '../constants/uploadLimits';

const ICON_STROKE = 1.5;
const FONT_BODY = '"Roboto Mono", ui-monospace, monospace';

export interface MemoryPhotoModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (file: File) => void;
}

export const MemoryPhotoModal: React.FC<MemoryPhotoModalProps> = ({ open, onClose, onSave }) => {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const localInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setFile(null);
    setSizeError(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const applyFile = useCallback((f: File | null) => {
    setSizeError(null);
    if (!f || !f.type.startsWith('image/')) return;
    const chk = assertFileSizeOk(f);
    if (!chk.ok) {
      setSizeError('File is too large.');
      return;
    }
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    setFile(f);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.42)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <input
        ref={localInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => applyFile(e.target.files?.[0] ?? null)}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => applyFile(e.target.files?.[0] ?? null)}
      />

      <div
        className="bg-white w-full max-w-[720px] min-h-[620px] border border-black shadow-xl rounded-none overflow-hidden flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ fontFamily: FONT_BODY, fontWeight: 400 }}
      >
        <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4">
          <button
            type="button"
            className="text-[16px] text-[#5a5a5a] bg-transparent border-0 cursor-pointer"
            onClick={handleClose}
          >
            &lt; Back to map
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="h-9 w-9 bg-transparent border-0 flex items-center justify-center cursor-pointer hover:opacity-75"
              aria-label="Upload from file"
              onClick={() => localInputRef.current?.click()}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
                <path d="M12 10v6M9 13h6" />
              </svg>
            </button>
            <a
              href="https://drive.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="h-9 w-9 bg-transparent border-0 flex items-center justify-center text-black hover:opacity-75"
              aria-label="Upload from drive"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="m7 10 5-5 5 5" />
                <path d="M12 5v10" />
              </svg>
            </a>
          </div>
        </div>

        <div className="px-6 pb-6 flex-1 flex flex-col">
          {sizeError && <p className="m-0 mb-3 text-[13px] text-red-600">{sizeError}</p>}

          <button
            type="button"
            className="w-full min-h-[420px] flex-1 border border-dashed border-black/45 bg-[#fafafa] rounded-none flex items-center justify-center p-6 cursor-pointer"
            onClick={() => cameraInputRef.current?.click()}
            aria-label="Instant photo"
          >
            {previewUrl ? (
              <img src={previewUrl} alt="" className="max-h-[380px] w-auto object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-4 text-[#5a5a5a]">
                <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
                <span className="text-[20px]">Instant photo</span>
              </div>
            )}
          </button>
        </div>

        <div className="border-t border-black/20 px-6 py-4 flex justify-end">
          <button
            type="button"
            className="px-5 py-2 border border-black bg-white text-black text-sm hover:bg-neutral-100 rounded-none disabled:opacity-40"
            style={{ borderWidth: 1.5 }}
            disabled={!file}
            onClick={() => {
              if (!file) return;
              onSave(file);
              handleClose();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
