import React, { useCallback, useRef, useState } from 'react';
import { useLocalization } from '../context/LocalizationContext';
import { assertFileSizeOk } from '../constants/uploadLimits';
import {
  BUILDING_STYLE_OPTIONS,
  DEFAULT_BUILDING_STYLE,
  type BuildingStyleId,
} from '../prompts/buildingStyle';

const STYLE_I18N_KEY: Record<BuildingStyleId, string> = {
  flat: 'buildingStyle_flat',
  pixel: 'buildingStyle_pixel',
  ink: 'buildingStyle_ink',
  healing: 'buildingStyle_healing',
};

const ICON_STROKE = 1.5;

type ModalStep = 'method' | 'review';

export interface AddBuildingModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (file: File, buildingName: string, buildingStyle: BuildingStyleId) => void;
}

export const AddBuildingModal: React.FC<AddBuildingModalProps> = ({ open, onClose, onSave }) => {
  const { t } = useLocalization();
  const [step, setStep] = useState<ModalStep>('method');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [buildingName, setBuildingName] = useState('');
  const [buildingStyle, setBuildingStyle] = useState<BuildingStyleId>(DEFAULT_BUILDING_STYLE);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const localInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep('method');
    setFile(null);
    setBuildingName('');
    setBuildingStyle(DEFAULT_BUILDING_STYLE);
    setSizeError(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const applyFile = useCallback((f: File | null, source: 'local' | 'camera') => {
    setSizeError(null);
    if (!f || !f.type.startsWith('image/')) return;
    const chk = assertFileSizeOk(f);
    if (!chk.ok) {
      setSizeError(t('toastFileTooLarge'));
      return;
    }
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    setFile(f);
    if (source === 'camera') setStep('review');
  }, [t]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <input
        ref={localInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => applyFile(e.target.files?.[0] ?? null, 'local')}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => applyFile(e.target.files?.[0] ?? null, 'camera')}
      />

      {step === 'method' ? (
        <div
          className="bg-white w-full max-w-[880px] border border-black shadow-xl flex flex-col rounded-none overflow-hidden"
          onMouseDown={(e) => e.stopPropagation()}
          style={{ fontFamily: '"Roboto Mono", ui-monospace, monospace', fontWeight: 400 }}
        >
          <div className="px-6 md:px-12 pt-6 pb-5 flex flex-col gap-4">
            <button
              type="button"
              className="self-start text-[18px] text-[#5a5a5a] bg-transparent border-0 cursor-pointer"
              onClick={handleClose}
            >
              &lt; Back to map
            </button>

            {sizeError && <p className="m-0 text-[13px] text-red-600">{sizeError}</p>}

            <div className="flex items-center justify-end gap-4">
              <button
                type="button"
                className="h-9 w-9 bg-transparent border-0 rounded-none flex items-center justify-center cursor-pointer hover:opacity-75"
                aria-label="Upload from local"
                onClick={() => localInputRef.current?.click()}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
                  <path d="M12 10v6M9 13h6" />
                </svg>
              </button>
              <a
                href="https://drive.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 w-9 bg-transparent border-0 rounded-none flex items-center justify-center text-black hover:opacity-75"
                aria-label="Upload from Google Drive"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <path d="m7 10 5-5 5 5" />
                  <path d="M12 5v10" />
                </svg>
              </a>
            </div>

            <div className="relative border border-dashed border-black/50 bg-[#fafafa] min-h-[330px] rounded-none overflow-hidden">
              <button
                type="button"
                className="w-full h-full min-h-[330px] border-0 bg-transparent cursor-pointer flex items-center justify-center p-5"
                onClick={() => cameraInputRef.current?.click()}
                aria-label="Instant photo"
              >
                {previewUrl ? (
                  <img src={previewUrl} alt="" className="max-h-[300px] w-auto object-contain" />
                ) : (
                  <div className="flex flex-col items-center gap-4 text-[#5a5a5a]">
                    <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
                      <circle cx="12" cy="13" r="3" />
                    </svg>
                    <span className="text-[20px]">Instant photo</span>
                  </div>
                )}
              </button>
            </div>

            <div>
              <label className="block text-[18px] text-[#4f4f4f] mb-2" htmlFor="m01-building-name">
                Building name
              </label>
              <input
                id="m01-building-name"
                className="w-full h-11 px-3 border border-black bg-white text-[#332115] text-sm outline-none rounded-none focus:ring-2 focus:ring-[#0053D4]/35"
                style={{ borderWidth: 1.5 }}
                value={buildingName}
                placeholder=""
                onChange={(e) => setBuildingName(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div>
              <label className="block text-[18px] text-[#4f4f4f] mb-2" htmlFor="m01-building-style">
                Building style
              </label>
              <div className="relative">
                <select
                  id="m01-building-style"
                  className="w-full h-11 pl-3 pr-10 border border-black bg-white text-[#332115] text-sm outline-none rounded-none focus:ring-2 focus:ring-[#0053D4]/35 appearance-none cursor-pointer"
                  style={{ borderWidth: 1.5 }}
                  value={buildingStyle}
                  onChange={(e) => setBuildingStyle(e.target.value as BuildingStyleId)}
                  aria-label={t('buildingStyleLabel')}
                >
                  {BUILDING_STYLE_OPTIONS.map(({ id }) => (
                    <option key={id} value={id}>
                      {t(STYLE_I18N_KEY[id])}
                    </option>
                  ))}
                </select>
                <span
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#756F6C] text-xs"
                  aria-hidden
                >
                  ▼
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-black/20 px-6 md:px-12 py-4 flex justify-end">
            <button
              type="button"
              className="px-5 py-2 border border-black bg-white text-black text-sm hover:bg-neutral-100 rounded-none disabled:opacity-40"
              style={{ borderWidth: 1.5 }}
              disabled={!file}
              onClick={() => {
                if (!file) return;
                onSave(file, buildingName.trim(), buildingStyle);
                reset();
                onClose();
              }}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div
          className="bg-white w-full max-w-[640px] border border-black shadow-xl rounded-none overflow-hidden"
          onMouseDown={(e) => e.stopPropagation()}
          style={{ fontFamily: '"Roboto Mono", ui-monospace, monospace', fontWeight: 400 }}
        >
          <div className="p-4">
            <button
              type="button"
              className="text-[18px] text-[#5a5a5a] bg-transparent border-0 cursor-pointer"
              onClick={() => setStep('method')}
            >
              &lt; Back to building method
            </button>
          </div>

          <div className="bg-[#f2f2f2] min-h-[420px] flex items-center justify-center">
            {previewUrl ? (
              <img src={previewUrl} alt="" className="w-full h-[420px] object-cover object-center" />
            ) : (
              <div className="text-sm text-[#666]">No photo</div>
            )}
          </div>

          <div className="flex items-center justify-center gap-8 py-5">
            <button
              type="button"
              className="h-12 w-12 border-0 bg-transparent cursor-pointer flex items-center justify-center"
              onClick={() => cameraInputRef.current?.click()}
              aria-label="Retake"
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <path d="M21 3v6h-6" />
              </svg>
            </button>
            <button
              type="button"
              className="h-12 w-12 border-0 bg-transparent cursor-pointer flex items-center justify-center"
              onClick={() => setStep('method')}
              aria-label="Confirm"
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="m8 12 2.6 2.6L16.5 9" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
