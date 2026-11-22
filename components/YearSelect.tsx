import React, { useEffect, useRef, useState } from 'react';

const COMFORTAA_FONT = '"Comfortaa", cursive';
const PANEL_BORDER = '#ece7df';

export interface YearSelectProps {
  label: string;
  value: number;
  options: number[];
  onChange: (year: number) => void;
  className?: string;
}

export const YearSelect: React.FC<YearSelectProps> = ({
  label,
  value,
  options,
  onChange,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative shrink-0 ${className}`}>
      <button
        type="button"
        className="flex min-h-7 w-full items-center justify-between gap-2 border-0 bg-transparent px-0 py-0 text-left transition-colors hover:text-[#5f5954] focus-visible:outline-none focus-visible:ring-0"
        style={{
          fontFamily: COMFORTAA_FONT,
          fontSize: 13,
          color: '#756f6c',
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${value}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 truncate">{label}</span>
        <span className="flex shrink-0 items-center gap-2">
          <span>{value}</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d={open ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} />
          </svg>
        </span>
      </button>

      {open && (
        <div
          className="absolute left-0 top-[calc(100%+3px)] z-50 w-full overflow-y-auto border bg-white p-0 shadow-[0_6px_14px_rgba(17,17,17,0.1)]"
          style={{
            borderColor: PANEL_BORDER,
            maxHeight: 5 * 28,
            overscrollBehavior: 'contain',
          }}
          role="listbox"
          aria-label={label}
        >
          {options.map((option) => {
            const selected = option === value;
            return (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={selected}
                className="flex min-h-7 w-full items-center justify-between border-0 px-2 py-1 text-left transition-colors hover:bg-[#f7f4ee] focus-visible:bg-[#f7f4ee] focus-visible:outline-none"
                style={{
                  fontFamily: COMFORTAA_FONT,
                  fontSize: 12,
                  color: '#111',
                  backgroundColor: selected ? '#e9e7e4' : 'white',
                }}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                <span>{option}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
