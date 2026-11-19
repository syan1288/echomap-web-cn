import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AudioEntry, LogData, PhotoData } from '../web/app/webMemoryTypes';
import { MoonFaceAvatar } from './MoonFaceAvatar';
import ScrollStack, { ScrollStackItem } from './ScrollStack';
import {
  requestMemoryShare,
  type MemorySharePlatform,
} from '../services/memoryShare';

const FONT_TITLE = '"Roboto Mono", ui-monospace, monospace';
const FONT_BODY = '"Roboto Mono", ui-monospace, monospace';
const LONG_PRESS_MS = 420;

const IconSelectPulse = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" stroke="currentColor" strokeWidth="1.4" />
    <path d="M8.2 12.5 10.9 15l5-6.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconShare = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="M8.7 10.7 15.4 6.8M8.7 13.3l6.7 3.9" />
  </svg>
);

const IconEdit = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 20h9" />
    <path d="m16.5 3.5 4 4L8 20H4v-4Z" />
  </svg>
);

const IconTrash = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

const IconImmersive = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 3H5a2 2 0 0 0-2 2v2M17 3h2a2 2 0 0 1 2 2v2M7 21H5a2 2 0 0 1-2-2v-2M17 21h2a2 2 0 0 0 2-2v-2" />
    <path d="M9 16V8" />
    <path d="M12 19V5" />
    <path d="M15 16V8" />
  </svg>
);

const IconSystemShare = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden>
    <path d="M15 2.5a12.5 12.5 0 0 1 10.7 6.05H16.4L11.2 3.4A12.45 12.45 0 0 1 15 2.5Z" fill="#6366F1" />
    <path d="M27.2 10.5A12.5 12.5 0 0 1 22.8 24l-4.6-8 4.05-5.5h4.95Z" fill="#4F7FE5" />
    <path d="M21.25 25.1A12.5 12.5 0 0 1 7.3 24.2l4.75-8.2h6.15l3.05 9.1Z" fill="#16AEEA" />
    <path d="M5.75 22.8A12.5 12.5 0 0 1 3.4 8.8l8.25 4.75.4 2.45-6.3 6.8Z" fill="#5DD01B" />
    <path d="M4.45 6.95A12.47 12.47 0 0 1 9.2 3.9l5.4 5.45-2.95 4.2-7.2-6.6Z" fill="#FFC21A" />
    <path d="M9.2 3.9a12.5 12.5 0 0 1 2-.5l5.2 5.15-1.8.8-5.4-5.45Z" fill="#FF7A1A" />
    <circle cx="15" cy="15" r="4.4" fill="#fff" />
  </svg>
);

const IconWechat = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden>
    <path d="M13.1 7.1c-4.5 0-8.1 2.9-8.1 6.5 0 2 1.1 3.8 2.9 5l-.55 2.4 2.8-1.4c.92.3 1.9.48 2.95.48 4.5 0 8.1-2.9 8.1-6.48S17.6 7.1 13.1 7.1Z" fill="#19BF2B" />
    <path d="M18.1 13.9c-3.75 0-6.8 2.45-6.8 5.48s3.05 5.47 6.8 5.47c.78 0 1.52-.11 2.2-.32l2.32 1.17-.45-1.98c1.68-1.02 2.73-2.58 2.73-4.34 0-3.03-3.05-5.48-6.8-5.48Z" fill="#12A925" />
    <circle cx="10.2" cy="12.95" r="0.86" fill="#fff" />
    <circle cx="15.5" cy="12.95" r="0.86" fill="#fff" />
    <circle cx="16.2" cy="18.85" r="0.72" fill="#fff" />
    <circle cx="20.35" cy="18.85" r="0.72" fill="#fff" />
  </svg>
);

const IconXiaohongshu = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden>
    <circle cx="15" cy="15" r="13" fill="#FF2442" />
    <text
      x="15"
      y="17.2"
      textAnchor="middle"
      dominantBaseline="middle"
      fill="#fff"
      fontSize="6.2"
      fontWeight="900"
      fontFamily='"Arial Black", "PingFang SC", "Microsoft YaHei", sans-serif'
      letterSpacing="-0.6"
    >
      小红书
    </text>
  </svg>
);

async function copyShareText(text: string): Promise<'copied' | 'blocked' | 'empty'> {
  if (!text.trim()) return 'empty';

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return 'copied';
    }
  } catch {
    // Permission-denied clipboard errors should not fail the backend share handoff.
  }

  let textarea: HTMLTextAreaElement | null = null;
  try {
    textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    return copied ? 'copied' : 'blocked';
  } catch {
    return 'blocked';
  } finally {
    if (textarea?.parentNode) {
      textarea.parentNode.removeChild(textarea);
    }
  }
}

export interface GalleryDetailModalsProps {
  openM03: boolean;
  openM04: boolean;
  log: LogData;
  photos: PhotoData[];
  audioEntries: AudioEntry[];
  onDeletePhotos?: (photoIndexes: number[]) => void;
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
  onDeletePhotos,
  onGoToMemories,
  onBackToGalleryFromM03,
  onBackToDiary,
  onBackToGalleryFromM04,
}) => {
  const [immersiveOpen, setImmersiveOpen] = useState(false);
  const [immersiveStartIndex, setImmersiveStartIndex] = useState(0);
  const [playlistIndex, setPlaylistIndex] = useState(0);
  const [selectedPhotoIndexes, setSelectedPhotoIndexes] = useState<number[]>([]);
  const [shareExpanded, setShareExpanded] = useState(false);
  const [shareBusy, setShareBusy] = useState<MemorySharePlatform | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [photoScrollActive, setPhotoScrollActive] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const photoScrollTimerRef = useRef<number | null>(null);

  const selectedCount = selectedPhotoIndexes.length;
  const selectedSet = useMemo(() => new Set(selectedPhotoIndexes), [selectedPhotoIndexes]);
  const buildingName = (log.buildingName || log.location || 'Echo Map memory').trim();
  const immersivePhotos = useMemo(() => {
    if (!photos.length) return [];
    return photos.slice(immersiveStartIndex).concat(photos.slice(0, immersiveStartIndex));
  }, [immersiveStartIndex, photos]);

  useEffect(() => {
    if (!openM04) {
      setImmersiveOpen(false);
      setImmersiveStartIndex(0);
      setPlaylistIndex(0);
      setSelectedPhotoIndexes([]);
      setShareExpanded(false);
      setDeleteModalOpen(false);
      setFeedback(null);
      setPhotoScrollActive(false);
    }
  }, [openM04]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
      if (photoScrollTimerRef.current !== null) {
        window.clearTimeout(photoScrollTimerRef.current);
      }
    };
  }, []);

  const playbackQueue = [...audioEntries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'music' ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

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
        className="echo-gallery-detail-modal bg-white w-full max-w-[512px] border border-black shadow-xl p-6 rounded-none"
        style={{ fontFamily: FONT_BODY, fontWeight: 400 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {body}
      </div>
    </div>
  );

  const togglePhotoSelection = (photoIndex: number) => {
    setSelectedPhotoIndexes((prev) => {
      if (prev.includes(photoIndex)) return prev.filter((item) => item !== photoIndex);
      return [...prev, photoIndex].sort((a, b) => a - b);
    });
    setShareExpanded(false);
  };

  const startSelection = (photoIndex: number) => {
    setSelectedPhotoIndexes((prev) => (prev.includes(photoIndex) ? prev : [...prev, photoIndex].sort((a, b) => a - b)));
    setShareExpanded(false);
  };

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const showPhotoScrollbar = () => {
    setPhotoScrollActive(true);
    if (photoScrollTimerRef.current !== null) {
      window.clearTimeout(photoScrollTimerRef.current);
    }
    photoScrollTimerRef.current = window.setTimeout(() => {
      setPhotoScrollActive(false);
      photoScrollTimerRef.current = null;
    }, 800);
  };

  const openImmersive = (photoIndex: number) => {
    setImmersiveStartIndex(photoIndex);
    setPlaylistIndex(0);
    setImmersiveOpen(true);
  };

  const handleShare = async (platform: MemorySharePlatform) => {
    if (!selectedCount) return;
    setShareBusy(platform);
    try {
      const payload = await requestMemoryShare({
        platform,
        buildingName,
        photoUrls: selectedPhotoIndexes.map((index) => photos[index]?.url).filter(Boolean),
        note: log.musings?.trim() || `Sharing ${selectedCount} memory photo${selectedCount > 1 ? 's' : ''} from ${buildingName}.`,
      });

      if (platform === 'system' && typeof navigator !== 'undefined' && 'share' in navigator) {
        await navigator.share({
          title: payload.shareTitle,
          text: payload.shareText,
          url: payload.shareUrl || undefined,
        });
        setFeedback('Shared through the system share sheet.');
      } else {
        const combined = payload.clipboardText || [payload.shareTitle, payload.shareText, payload.shareUrl].filter(Boolean).join('\n');
        const copyResult = await copyShareText(combined);
        const channel =
          platform === 'wechat'
            ? 'WeChat share copy'
            : platform === 'xiaohongshu'
              ? 'Xiaohongshu share copy'
              : 'Share copy';
        setFeedback(
          copyResult === 'copied'
            ? `${channel} prepared by backend and copied.`
            : `${channel} prepared by backend. Clipboard permission is blocked.`
        );
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Share failed.');
    } finally {
      setShareBusy(null);
    }
  };

  const handleConfirmDelete = () => {
    if (!onDeletePhotos || !selectedCount) return;
    if (selectedCount >= photos.length) {
      setFeedback('Keep at least one photo in this memory.');
      setDeleteModalOpen(false);
      return;
    }
    onDeletePhotos(selectedPhotoIndexes);
    setSelectedPhotoIndexes([]);
    setDeleteModalOpen(false);
    setShareExpanded(false);
    setFeedback(`Deleted ${selectedCount} photo${selectedCount > 1 ? 's' : ''}.`);
  };

  if (!openM03 && !openM04) return null;

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
            className="text-sm text-[#756F6C] bg-transparent border-0 cursor-pointer"
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
      <div className="flex justify-between items-center gap-4 mb-6 text-sm leading-none" style={{ fontFamily: FONT_TITLE, fontWeight: 600 }}>
        <button
          type="button"
          className="text-[#616161] bg-transparent border-0 cursor-pointer"
          onClick={onBackToDiary}
        >
          &lt; Back to diary
        </button>
        <button
          type="button"
          className="text-[#616161] bg-transparent border-0 cursor-pointer"
          onClick={onBackToGalleryFromM04}
        >
          Back to gallery &gt;
        </button>
      </div>

      <div className="echo-gallery-photos-panel mx-auto w-[450px] max-w-full">
        <div className="mb-3 flex w-full items-center justify-between gap-4">
          <h3 className="m-0 text-[14px] text-[#4f5458]" style={{ fontFamily: FONT_TITLE, fontWeight: 600 }}>
            Photos
          </h3>
          <button
            type="button"
            className="flex h-5 w-5 items-center justify-center border-0 bg-transparent p-0 text-[#3b3b3b] transition-colors hover:text-black"
            aria-label="Open immersive photo review"
            onClick={() => {
              if (!photos.length) return;
              openImmersive(0);
            }}
          >
            <IconImmersive />
          </button>
        </div>

        <div
          className={`max-h-[360px] w-full overflow-y-auto overflow-x-hidden [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar:horizontal]:h-0 [&::-webkit-scrollbar-track]:bg-transparent ${
            photoScrollActive
              ? '[scrollbar-color:rgba(51,33,21,0.35)_transparent] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-black/25'
              : '[scrollbar-color:transparent_transparent] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-transparent'
          }`}
          onScroll={showPhotoScrollbar}
          onWheel={showPhotoScrollbar}
          onTouchMove={showPhotoScrollbar}
        >
          <div className="echo-gallery-photos-grid grid w-full grid-cols-3 content-start justify-start gap-2">
            {photos.map((p, absoluteIndex) => {
              const checked = selectedSet.has(absoluteIndex);

              return (
                <button
                  key={p.photo_id ?? absoluteIndex}
                  type="button"
                  className="group relative aspect-square w-full border border-black/50 bg-[#fafafa] overflow-hidden cursor-pointer p-0 text-left"
                  onClick={() => {
                    if (longPressTriggeredRef.current) {
                      longPressTriggeredRef.current = false;
                      return;
                    }
                    if (selectedCount) {
                      togglePhotoSelection(absoluteIndex);
                      return;
                    }
                    openImmersive(absoluteIndex);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    if (checked) togglePhotoSelection(absoluteIndex);
                    else startSelection(absoluteIndex);
                  }}
                  onTouchStart={() => {
                    clearLongPress();
                    longPressTriggeredRef.current = false;
                    longPressTimerRef.current = window.setTimeout(() => {
                      longPressTriggeredRef.current = true;
                      if (checked) togglePhotoSelection(absoluteIndex);
                      else startSelection(absoluteIndex);
                    }, LONG_PRESS_MS);
                  }}
                  onTouchEnd={clearLongPress}
                  onTouchCancel={clearLongPress}
                >
                  <img src={p.url} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]" />
                  <span
                    className={`absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full border border-black/20 bg-white text-black shadow-[0_8px_20px_rgba(0,0,0,0.12)] transition-all ${
                      checked ? 'opacity-100 scale-100' : 'opacity-0 scale-90 group-hover:opacity-70 group-hover:scale-100'
                    }`}
                  >
                    <IconSelectPulse />
                  </span>
                </button>
              );
            })}
            {photos.length === 0 && (
              <div className="col-span-full text-sm text-neutral-500 py-6 text-center">No photos yet.</div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 min-h-[1.25rem] text-center text-[13px] text-[#6d6d6d]" style={{ fontFamily: FONT_BODY }}>
        {feedback}
      </div>

      {selectedCount > 0 && (
        <div className="mt-6 flex justify-center">
          <div className="echo-share-dock relative flex min-h-[72px] w-full max-w-full items-center justify-center border border-black/10 bg-white/92 px-4 py-3">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[12px] text-[#707070]" style={{ fontFamily: FONT_BODY }}>
              {selectedCount} selected
            </div>
            <div className="relative flex items-center justify-center gap-6">
              <button
                type="button"
                className="flex h-12 w-12 items-center justify-center border-0 bg-transparent p-0 text-black"
                onClick={() => setShareExpanded((prev) => !prev)}
                aria-label="Share selected photos"
              >
                <IconShare />
              </button>

              <div
                className={`flex items-center gap-8 transition-all duration-300 ${shareExpanded ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                aria-hidden={shareExpanded}
              >
                <button
                  type="button"
                  disabled
                  className="flex h-12 w-12 items-center justify-center border-0 bg-transparent p-0 text-[#B9B9B9] cursor-not-allowed"
                  aria-label="Edit selected photos"
                >
                  <IconEdit />
                </button>
                <button
                  type="button"
                  className="flex h-12 w-12 items-center justify-center border-0 bg-transparent p-0 text-black"
                  onClick={() => setDeleteModalOpen(true)}
                  aria-label="Delete selected photos"
                >
                  <IconTrash />
                </button>
              </div>

              <div
                className={`absolute left-[3.5rem] right-0 flex items-center justify-start gap-4 transition-all duration-300 ${
                  shareExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                <button
                  type="button"
                  className="flex h-12 w-12 items-center justify-center border-0 bg-transparent p-0 text-black disabled:opacity-40"
                  disabled={shareBusy !== null}
                  onClick={() => void handleShare('system')}
                  aria-label="Share via system"
                >
                  <IconSystemShare />
                </button>
                <button
                  type="button"
                  className="flex h-12 w-12 items-center justify-center border-0 bg-transparent p-0 disabled:opacity-40"
                  disabled={shareBusy !== null}
                  onClick={() => void handleShare('wechat')}
                  aria-label="Share to WeChat"
                >
                  <IconWechat />
                </button>
                <button
                  type="button"
                  className="flex h-12 w-12 items-center justify-center border-0 bg-transparent p-0 disabled:opacity-40"
                  disabled={shareBusy !== null}
                  onClick={() => void handleShare('xiaohongshu')}
                  aria-label="Share to Xiaohongshu"
                >
                  <IconXiaohongshu />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteModalOpen && (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/25 px-4" onMouseDown={() => setDeleteModalOpen(false)}>
          <div
            className="w-full max-w-[760px] border border-[#6e6e6e] bg-[#f6f7fb] px-10 py-10 shadow-[0_12px_34px_rgba(0,0,0,0.12)]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="text-[clamp(2rem,4vw,3rem)] text-[#616161]" style={{ fontFamily: FONT_TITLE }}>
              Delete these memories?
            </div>
            <div className="mt-8 flex items-center justify-between gap-6">
              <button
                type="button"
                className="min-w-[210px] border border-black bg-black px-8 py-3 text-[clamp(1.8rem,3vw,2.4rem)] text-white"
                style={{ fontFamily: FONT_TITLE }}
                onClick={() => setDeleteModalOpen(false)}
              >
                No
              </button>
              <button
                type="button"
                className="min-w-[210px] border border-[#7d7d7d] bg-white px-8 py-3 text-[clamp(1.8rem,3vw,2.4rem)] text-black"
                style={{ fontFamily: FONT_TITLE }}
                onClick={handleConfirmDelete}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {immersiveOpen && immersivePhotos.length > 0 && (
        <div
          className="fixed inset-0 z-[160] bg-[#ece6db] text-[#241f1b]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setImmersiveOpen(false);
          }}
        >
          <button
            type="button"
            className="absolute right-5 top-5 z-[3] flex h-7 w-7 items-center justify-center border border-black/20 bg-white/80 p-0 text-black"
            style={{ fontFamily: FONT_BODY }}
            onClick={() => setImmersiveOpen(false)}
            aria-label="Close immersive review"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
          <div className="absolute left-5 top-5 z-[3] text-[13px] uppercase tracking-[0.22em] text-[#5f5a54]" style={{ fontFamily: FONT_BODY }}>
            Immersive review · {buildingName}
          </div>

          <ScrollStack
            className="h-screen"
            itemDistance={82}
            itemScale={0.035}
            itemStackDistance={32}
            stackPosition="22%"
            scaleEndPosition="12%"
            baseScale={0.88}
            scaleDuration={0.4}
            rotationRange={[-7, 7]}
            rotationSeed={7}
            offsetRange={[-86, 86]}
            blurAmount={0}
          >
            {immersivePhotos.map((photo, index) => (
              <ScrollStackItem key={photo.photo_id ?? `${photo.url}-${index}`}>
                <div className="mx-auto flex w-full max-w-[min(90vw,820px)] items-center justify-center">
                  <img
                    src={photo.url}
                    alt=""
                    className="block max-h-[72vh] w-auto max-w-full object-contain shadow-[0_26px_70px_rgba(66,49,26,0.20)]"
                    draggable={false}
                  />
                </div>
              </ScrollStackItem>
            ))}
          </ScrollStack>

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
        </div>
      )}
    </>
  );
};
