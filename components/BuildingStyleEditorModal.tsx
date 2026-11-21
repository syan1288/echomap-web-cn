import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocalization } from '../context/LocalizationContext';
import type { BuildingStyleDefinition } from '../shared/domain/building-style/buildingStyle';

interface BuildingStyleEditorModalProps {
  open: boolean;
  style: BuildingStyleDefinition | null;
  onCancel: () => void;
  onSave: (name: string, prompt: string) => void;
  onDelete?: () => void;
}

export const BuildingStyleEditorModal: React.FC<BuildingStyleEditorModalProps> = ({
  open,
  style,
  onCancel,
  onSave,
  onDelete,
}) => {
  const { t } = useLocalization();
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');

  useEffect(() => {
    if (!open || !style) return;
    setName(style.builtin ? t(`buildingStyle_${style.id}`) : style.name);
    setPrompt(style.prompt);
  }, [open, style, t]);

  if (!open || !style) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="w-full max-w-[640px] border border-black bg-white shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
        style={{ fontFamily: '"Roboto Mono", ui-monospace, monospace' }}
      >
        <div className="space-y-5 p-6 md:p-8">
          <label className="block text-left text-sm text-[#555]">
            <span className="mb-2 block">{t('styleNameLabel')}</span>
            <input
              className="h-11 w-full border border-black bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#0053D4]/35"
              value={name}
              readOnly={style.builtin}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="block text-left text-sm text-[#555]">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="block">{t('stylePromptLabel')}</span>
              <button
                type="button"
                className="flex h-10 w-10 shrink-0 items-center justify-center border border-black/45 bg-white text-xl text-[#555] shadow-[2px_2px_0_rgba(0,0,0,0.18)] transition-[transform,box-shadow,background-color] duration-150 hover:bg-black/[0.04] hover:shadow-[3px_3px_0_rgba(0,0,0,0.22)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0053D4]/45"
                aria-label={t('styleRestorePrompt')}
                onClick={() => setPrompt(style.prompt)}
              >
                ↻
              </button>
            </div>
            <textarea
              className="min-h-[190px] w-full resize-y border border-black bg-white px-3 py-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-[#0053D4]/35"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </label>
        </div>
        <div className="flex items-center justify-between border-t border-black/20 px-6 py-4 md:px-8">
          <div>
            {!style.builtin && onDelete && (
              <button
                type="button"
                className="border-0 bg-transparent px-1 py-2 text-sm text-red-600 underline decoration-red-300 underline-offset-4 transition-colors hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/35"
                onClick={onDelete}
              >
                {t('styleDelete')}
              </button>
            )}
          </div>
          <div className="flex gap-4">
            <button
              type="button"
              className="h-12 min-w-[122px] border border-black bg-white px-6 text-[15px] font-medium tracking-[0.01em] shadow-[2px_2px_0_rgba(0,0,0,0.16)] transition-[transform,box-shadow,background-color] duration-150 hover:bg-black/[0.04] hover:shadow-[3px_3px_0_rgba(0,0,0,0.2)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0053D4]/45"
              onClick={onCancel}
            >
              {t('styleCancel')}
            </button>
            <button
              type="button"
              className="h-12 min-w-[122px] border border-black bg-black px-6 text-[15px] font-medium tracking-[0.01em] text-white shadow-[3px_3px_0_rgba(0,0,0,0.22)] transition-[transform,box-shadow,background-color] duration-150 hover:bg-[#1f1f1f] hover:shadow-[4px_4px_0_rgba(0,0,0,0.26)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0053D4]/55 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              disabled={!name.trim() || !prompt.trim()}
              onClick={() => onSave(name, prompt)}
            >
              {t('styleSave')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? modal : createPortal(modal, document.body);
};
