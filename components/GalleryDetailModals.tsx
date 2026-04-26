import React, { useState, useEffect } from 'react';
import type { AudioEntry, LogData, PhotoData } from '../App';
import { MoonFaceAvatar } from './MoonFaceAvatar';

const FONT_TITLE = '"Roboto Mono", ui-monospace, monospace';
const FONT_BODY = '"Roboto Mono", ui-monospace, monospace';

export interface GalleryDetailModalsProps {
  openM03: boolean;
  openM04: boolean;
  log: LogData;
  photos: PhotoData[];
  audioEntries: AudioEntry[];
  onGoToMemories: () => void;
  onBackToGalleryFromM03: () => void;
  onBackToDiary: () => void;
  onBackToGalleryFromM04: () => void;
}

export const GalleryDetailModals: React.FC<GalleryDetailModalsProps> = ({
  openM03,
  openM04,
  log,
  photos,
  audioEntries,
  onGoToMemories,
  onBackToGalleryFromM03,
  onBackToDiary,
  onBackToGalleryFromM04,
}) => {
  const [page, setPage] = useState(1);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [playlistIndex, setPlaylistIndex] = useState(0);
  const perPage = 9;
  const totalPages = Math.max(1, Math.ceil(photos.length / perPage));
  const slice = photos.slice((page - 1) * perPage, page * perPage);

  useEffect(() => {
    const tp = Math.max(1, Math.ceil(photos.length / perPage));
    setPage((p) => Math.min(Math.max(1, p), tp));
  }, [photos.length, perPage, openM04]);

  useEffect(() => {
    if (!openM04) {
      setFullscreenOpen(false);
      setFullscreenIndex(0);
      setDragStartX(null);
      setPlaylistIndex(0);
    }
  }, [openM04]);

  const playbackQueue = [...audioEntries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'music' ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  if (!openM03 && !openM04) return null;

  const shell = (body: React.ReactNode) => (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          if (openM04) onBackToGalleryFromM04();
          else onBackToGalleryFromM03();
        }
      }}
    >
      <div
        className="bg-white w-full max-w-[720px] border border-black shadow-xl p-6 rounded-none"
        style={{ fontFamily: FONT_BODY, fontWeight: 400 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {body}
      </div>
    </div>
  );

  if (openM03) {
    return shell(
      <>
        <button
          type="button"
          className="text-sm text-[#756F6C] bg-transparent border-0 cursor-pointer mb-6"
          style={{ fontFamily: FONT_TITLE, fontWeight: 600 }}
          onClick={onBackToGalleryFromM03}
        >
          &lt; Back to gallery
        </button>
        <div className="space-y-4 text-[#332115]">
          <div>
            <p className="text-sm m-0 mb-1" style={{ fontFamily: FONT_TITLE, fontWeight: 600 }}>
              Date
            </p>
            <div className="border border-black px-3 py-2 text-sm bg-white rounded-none">{log.date || '—'}</div>
          </div>
          <div>
            <p className="text-sm m-0 mb-1" style={{ fontFamily: FONT_TITLE, fontWeight: 600 }}>
              Partner
            </p>
            <div className="border border-black px-3 py-2 text-sm bg-white rounded-none">{log.partner || '—'}</div>
          </div>
          <div>
            <p className="text-sm m-0 mb-1" style={{ fontFamily: FONT_TITLE, fontWeight: 600 }}>
              Moon
            </p>
            <div className="flex items-stretch justify-end gap-2">
              <div className="min-h-[40px] min-w-0 flex-1 border border-black bg-white px-3 py-2 text-sm text-neutral-500 rounded-none">
                {log.moon || 'Type your moon……'}
              </div>
              <div className="shrink-0 border border-black bg-white">
                <MoonFaceAvatar moon={log.moon} avatarVariant={log.avatarVariant} size={40} interactive={false} />
              </div>
            </div>
          </div>
          <div>
            <p className="text-sm m-0 mb-1" style={{ fontFamily: FONT_TITLE, fontWeight: 600 }}>
              Just writing
            </p>
            <div className="border border-black px-3 py-2 text-sm bg-white min-h-[96px] whitespace-pre-wrap rounded-none">
              {log.musings || '—'}
            </div>
          </div>
        </div>
        <div className="flex justify-end mt-8">
          <button
            type="button"
            className="text-sm text-[#0053D4] underline-offset-2 hover:underline bg-transparent border-0 cursor-pointer"
            style={{ fontFamily: FONT_TITLE, fontWeight: 600 }}
            onClick={onGoToMemories}
          >
            &gt; Go to memories
          </button>
        </div>
      </>
    );
  }

  return shell(
    <>
      <div className="flex justify-between items-center gap-4 mb-6">
        <button
          type="button"
          className="text-sm text-[#756F6C] bg-transparent border-0 cursor-pointer"
          style={{ fontFamily: FONT_TITLE, fontWeight: 600 }}
          onClick={onBackToDiary}
        >
          &lt; Back to diary
        </button>
        <button
          type="button"
          className="text-sm text-[#756F6C] bg-transparent border-0 cursor-pointer"
          style={{ fontFamily: FONT_TITLE, fontWeight: 600 }}
          onClick={onBackToGalleryFromM04}
        >
          &gt; Back to gallery
        </button>
      </div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg m-0 text-[#332115]" style={{ fontFamily: FONT_TITLE, fontWeight: 600 }}>
          Photos
        </h3>
        <button
          type="button"
          className="h-9 w-9 border-0 bg-transparent cursor-pointer text-[#5a5a5a] hover:text-black"
          aria-label="Open immersive photo review"
          onClick={() => {
            if (!photos.length) return;
            setFullscreenIndex(0);
            setPlaylistIndex(0);
            setFullscreenOpen(true);
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M7 3H5a2 2 0 0 0-2 2v2M17 3h2a2 2 0 0 1 2 2v2M7 21H5a2 2 0 0 1-2-2v-2M17 21h2a2 2 0 0 0 2-2v-2" />
            <path d="M9 16V8" />
            <path d="M12 19V5" />
            <path d="M15 16V8" />
          </svg>
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {slice.map((p, i) => (
          <div
            key={p.photo_id ?? `${(page - 1) * perPage + i}`}
            className="aspect-square border border-black bg-[#fafafa] overflow-hidden cursor-pointer"
            onClick={() => {
              setFullscreenIndex((page - 1) * perPage + i);
              setFullscreenOpen(true);
            }}
          >
            <img src={p.url} alt="" className="w-full h-full object-cover" />
          </div>
        ))}
        {slice.length === 0 && (
          <div className="col-span-3 text-sm text-neutral-500 py-6 text-center">No photos yet.</div>
        )}
      </div>
      {totalPages > 1 && (
        <div className="flex justify-center gap-10 mt-8 text-sm" style={{ fontFamily: FONT_BODY }}>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              className={`border-0 bg-transparent cursor-pointer ${page === n ? 'font-bold text-[#332115]' : 'text-[#756F6C]'}`}
              onClick={() => setPage(n)}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      {fullscreenOpen && photos[fullscreenIndex] && (
        <div
          className="fixed inset-0 z-[160] bg-black/92 flex items-center justify-center"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setFullscreenOpen(false);
          }}
        >
          <div
            className="max-w-[92vw] max-h-[88vh] flex items-center justify-center px-6"
            onMouseDown={(e) => {
              e.stopPropagation();
              setDragStartX(e.clientX);
            }}
            onMouseUp={(e) => {
              if (dragStartX === null) return;
              const dx = e.clientX - dragStartX;
              if (Math.abs(dx) < 56) {
                setDragStartX(null);
                return;
              }
              if (dx < 0 && fullscreenIndex < photos.length - 1) setFullscreenIndex((p) => p + 1);
              if (dx > 0 && fullscreenIndex > 0) setFullscreenIndex((p) => p - 1);
              setDragStartX(null);
            }}
          >
            <img
              src={photos[fullscreenIndex].url}
              alt=""
              className="max-h-[88vh] max-w-[92vw] object-contain select-none"
              draggable={false}
            />
          </div>
          {playbackQueue[playlistIndex] && (
            <audio
              key={`${playbackQueue[playlistIndex].id}-${playlistIndex}`}
              src={playbackQueue[playlistIndex].url}
              autoPlay
              onEnded={() => {
                setPlaylistIndex((prev) => (prev < playbackQueue.length - 1 ? prev + 1 : prev));
              }}
            />
          )}
          <div
            className="absolute bottom-5 text-white/75 text-[12px]"
            style={{ fontFamily: FONT_BODY, fontWeight: 400 }}
          >
            {fullscreenIndex + 1} / {photos.length}
            {playbackQueue[playlistIndex] ? ` · now playing: ${playbackQueue[playlistIndex].title}` : ''}
          </div>
        </div>
      )}
    </>
  );
};
