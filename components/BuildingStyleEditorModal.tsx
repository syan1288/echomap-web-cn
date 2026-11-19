import React, { createPortal, useEffect, useState } from 'react';
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
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');

  useEffect(() => {
    if (!open || !style) return;
    setName(style.name);
    setPrompt(style.prompt);
  }, [open, style]);

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
            <span className="mb-2 block">风格名称</span>
            <input
              className="h-11 w-full border border-black bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#0053D4]/35"
              value={name}
              readOnly={style.builtin}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="block text-left text-sm text-[#555]">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="block">Prompt</span>
              <button
                type="button"
                className="flex h-7 w-7 shrink-0 items-center justify-center border-0 bg-transparent text-lg text-[#555] hover:bg-black/5"
                aria-label="恢复默认 Prompt"
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
              <button type="button" className="border-0 bg-transparent px-1 py-2 text-sm text-red-600" onClick={onDelete}>
                删除
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" className="border border-black bg-white px-5 py-2 text-sm" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="border border-black bg-black px-5 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!name.trim() || !prompt.trim()}
              onClick={() => onSave(name, prompt)}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? modal : createPortal(modal, document.body);
};
