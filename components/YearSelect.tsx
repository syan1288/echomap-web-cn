import React, { useEffect, useRef, useState } from 'react';

const COMFORTAA_FONT = '"Comfortaa", cursive';
const BLUE = '#1687ff';
const SKY_BLUE = '#c6ddff';

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
        className="flex min-h-8 w-full items-center justify-between gap-3 rounded-[8px] border bg-white px-3 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1687ff]/30"
        style={{
          borderColor: open ? BLUE : BLUE,
          fontFamily: COMFORTAA_FONT,
          fontSize: 12,
          color: '#111',
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
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
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
          className="absolute left-0 top-[calc(100%+4px)] z-50 w-full overflow-y-auto rounded-[8px] border bg-white p-1 shadow-[0_8px_20px_rgba(17,17,17,0.12)]"
          style={{
            borderColor: BLUE,
            maxHeight: 5 * 32 + 8,
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
                className="flex min-h-8 w-full items-center justify-between rounded-[6px] border border-transparent px-2.5 py-1 text-left transition-colors hover:border-[#1687ff] hover:bg-[#c6ddff]/65 focus-visible:border-[#1687ff] focus-visible:bg-[#c6ddff]/65 focus-visible:outline-none"
                style={{
                  fontFamily: COMFORTAA_FONT,
                  fontSize: 12,
                  color: '#111',
                  backgroundColor: selected ? SKY_BLUE : 'white',
                }}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                <span>{option}</span>
                {selected && <span aria-hidden>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
