import React, { useMemo, useState, useEffect, useRef } from 'react';
import type { ProcessedImage } from '../web/app/webMemoryTypes';
import { filterBuildings, suggestLabels, type GalleryDim } from '../shared/domain/gallery/galleryFilter';
import { galleryBuildingTitle } from '../shared/domain/gallery/buildingLabel';
import { normalizeAvatarVariant } from '../utils/moonFacehash';
import { GalleryMoonPopover } from './GalleryMoonPopover';
import { TravelHeatmapCalendar } from './TravelHeatmapCalendar';

const LABEL_OLIVE = '#4A5A3C';
/** 分页指示器：描边与选中填充同色（灰） */
const CAROUSEL_DOT = '#756F6C';
/** 每页建筑格数（2×3）；圆点数为 totalPages + 1 */
const GALLERY_ITEMS_PER_PAGE = 6;
/** 统一展示框：所有建筑都落在同一舞台高度内，避免压到标题 */
const THUMB_FRAME =
  'relative mx-auto flex h-[150px] w-full max-w-[min(100%,280px)] shrink-0 items-center justify-center overflow-visible sm:h-[160px] sm:max-w-[min(100%,300px)] md:h-[172px] md:max-w-[min(100%,320px)]';
const thumbBoxClass =
  'flex w-full shrink-0 items-center justify-center overflow-visible px-4 py-1 min-h-0';
const GALLERY_SEARCH_BORDER_PX = 1.5;
const CROP_SIDE_PADDING_RATIO = 0.1;
const CROP_TOP_PADDING_RATIO = 0.08;
const CROP_BOTTOM_PADDING_RATIO = 0.14;

type GalleryThumbSource = { src: string; cropped: boolean };

function mapAlignedBuildingSrc(b: ProcessedImage): string | null {
  return (
    b.processedImage?.src ??
    (!b.isGenerating && b.photos[0]?.url ? b.photos[0].url : null) ??
    null
  );
}

function cropImageForGallery(src: string): Promise<GalleryThumbSource> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const sourceWidth = Math.max(1, img.naturalWidth || img.width || 1);
      const sourceHeight = Math.max(1, img.naturalHeight || img.height || 1);

      try {
        const canvas = document.createElement('canvas');
        canvas.width = sourceWidth;
        canvas.height = sourceHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Could not read gallery image pixels');

        ctx.drawImage(img, 0, 0, sourceWidth, sourceHeight);
        const pixels = ctx.getImageData(0, 0, sourceWidth, sourceHeight).data;
        let minX = sourceWidth;
        let minY = sourceHeight;
        let maxX = -1;
        let maxY = -1;

        for (let y = 0; y < sourceHeight; y += 1) {
          for (let x = 0; x < sourceWidth; x += 1) {
            const idx = (y * sourceWidth + x) * 4;
            const r = pixels[idx];
            const g = pixels[idx + 1];
            const b = pixels[idx + 2];
            const alpha = pixels[idx + 3];
            if (alpha <= 12) continue;
            if (r > 246 && g > 246 && b > 246) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }

        if (maxX < minX || maxY < minY) {
          resolve({ src, cropped: false });
          return;
        }

        const contentWidth = maxX - minX + 1;
        const contentHeight = maxY - minY + 1;
        const sidePadding = Math.max(18, Math.round(contentWidth * CROP_SIDE_PADDING_RATIO));
        const topPadding = Math.max(14, Math.round(contentHeight * CROP_TOP_PADDING_RATIO));
        const bottomPadding = Math.max(22, Math.round(contentHeight * CROP_BOTTOM_PADDING_RATIO));
        const cropX = Math.max(0, minX - sidePadding);
        const cropY = Math.max(0, minY - topPadding);
        const cropRight = Math.min(sourceWidth, maxX + sidePadding + 1);
        const cropBottom = Math.min(sourceHeight, maxY + bottomPadding + 1);
        const cropWidth = Math.max(1, cropRight - cropX);
        const cropHeight = Math.max(1, cropBottom - cropY);

        const out = document.createElement('canvas');
        out.width = cropWidth;
        out.height = cropHeight;
        const outCtx = out.getContext('2d');
        if (!outCtx) throw new Error('Could not crop gallery image');
        outCtx.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
        resolve({ src: out.toDataURL('image/png'), cropped: true });
      } catch {
        resolve({ src, cropped: false });
      }
    };
    img.onerror = () => reject(new Error('Could not load gallery image'));
    img.src = src;
  });
}

const GalleryBuildingThumb: React.FC<{ src: string }> = ({ src }) => {
  const [thumb, setThumb] = useState<GalleryThumbSource>({ src, cropped: false });
  useEffect(() => {
    let active = true;
    setThumb({ src, cropped: false });
    cropImageForGallery(src)
      .then((next) => {
        if (active) setThumb(next);
      })
      .catch(() => {
        if (active) setThumb({ src, cropped: false });
      });
    return () => {
      active = false;
    };
  }, [src]);

  return (
    <div className={THUMB_FRAME}>
      <img
        src={thumb.src}
        alt=""
        draggable={false}
        className="block max-h-full max-w-full select-none object-contain"
        style={{ transform: thumb.cropped ? undefined : 'scale(1.35)' }}
      />
    </div>
  );
};

const FILTER_RECENT_KEY = 'echo_gallery_filter_recent';

function readFilterRecent(): string[] {
  try {
    const raw = localStorage.getItem(FILTER_RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string').slice(0, 5) : [];
  } catch {
    return [];
  }
}

function writeFilterRecent(q: string) {
  const t = q.trim();
  if (!t) return;
  const prev = readFilterRecent().filter((x) => x.toLowerCase() !== t.toLowerCase());
  const next = [t, ...prev].slice(0, 5);
  localStorage.setItem(FILTER_RECENT_KEY, JSON.stringify(next));
}

export interface GallerySectionProps {
  buildings: ProcessedImage[];
  onOpenBuilding: (id: number) => void;
  onSwipeToHome?: () => void;
}

const DIM_LABELS: { id: GalleryDim; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'city', label: 'City' },
  { id: 'country', label: 'Country' },
  { id: 'continent', label: 'Continent' },
];

export const GallerySection: React.FC<GallerySectionProps> = ({ buildings, onOpenBuilding, onSwipeToHome }) => {
  const [query, setQuery] = useState('');
  const [dim, setDim] = useState<GalleryDim>('all');
  const [openDim, setOpenDim] = useState(false);
  const [activeInput, setActiveInput] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => readFilterRecent());
  const [carouselPage, setCarouselPage] = useState(0);
  const [moonHover, setMoonHover] = useState<{
    el: HTMLElement | null;
    moon: string;
    avatarVariant: number;
  }>({ el: null, moon: '', avatarVariant: 0 });
  const gridRef = useRef<HTMLDivElement>(null);
  const touchStartYRef = useRef<number | null>(null);

  useEffect(() => {
    if (activeInput && query.length <= 1) setRecent(readFilterRecent());
  }, [activeInput, query]);

  const suggestions = useMemo(() => {
    if (query.trim().length < 2) return [];
    return suggestLabels(buildings, query, dim, 5);
  }, [buildings, query, dim]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (q.length >= 2) return filterBuildings(buildings, q, dim);
    return buildings;
  }, [buildings, query, dim]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / GALLERY_ITEMS_PER_PAGE) || 1);
  const dotCount = totalPages + 1;

  useEffect(() => {
    setCarouselPage((p) => Math.min(p, Math.max(0, totalPages - 1)));
  }, [filtered.length, totalPages]);

  const pageSlice = useMemo(() => {
    const start = carouselPage * GALLERY_ITEMS_PER_PAGE;
    return filtered.slice(start, start + GALLERY_ITEMS_PER_PAGE);
  }, [filtered, carouselPage]);

  const dropdownRows =
    activeInput && query.length <= 1
      ? recent.map((text, i) => ({ type: 'recent' as const, text, key: `r-${i}` }))
      : suggestions.map((text, i) => ({ type: 'suggest' as const, text, key: `s-${i}` }));

  return (
    <section id="gallery" className="relative flex flex-1 flex-col min-h-0 h-full w-full overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col bg-[#F9F1E2]">
        <div className="flex w-full flex-1 min-h-0 flex-col px-2 pt-6 pb-3 sm:px-3 md:px-4">
          <div className="mt-1 flex justify-center shrink-0 mb-6 w-full px-1">
            <div className="relative w-full max-w-[400px]">
              <div className="relative flex flex-1 min-w-0">
                <div className="relative shrink-0">
                  <button
                    type="button"
                    className="border border-black bg-white flex items-center justify-center text-xs shrink-0 rounded-none border-r-0"
                    style={{
                      color: '#332115',
                      width: 44,
                      height: 44,
                      borderWidth: GALLERY_SEARCH_BORDER_PX,
                      borderRightWidth: 0,
                      fontFamily: '"Roboto Mono", ui-monospace, monospace',
                    }}
                    aria-haspopup="listbox"
                    aria-expanded={openDim}
                    onClick={() => setOpenDim((v) => !v)}
                  >
                    ▼
                  </button>
                  {openDim && (
                    <ul
                      className="scrollbar-hide absolute left-0 mt-0 w-44 bg-white border border-black z-30 text-left text-sm shadow-none max-h-[200px] overflow-y-auto rounded-none"
                      role="listbox"
                      style={{
                        color: '#332115',
                        borderWidth: GALLERY_SEARCH_BORDER_PX,
                        fontFamily: '"Roboto Mono", ui-monospace, monospace',
                      }}
                    >
                      {DIM_LABELS.map((d) => (
                        <li key={d.id}>
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-black/[0.04] border-0 bg-white cursor-pointer"
                            onMouseDown={() => {
                              setDim(d.id);
                              setOpenDim(false);
                            }}
                          >
                            {d.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <input
                  className="flex-1 min-w-0 px-[14px] border border-black bg-white text-sm outline-none rounded-none"
                  style={{
                    color: '#332115',
                    height: 44,
                    borderWidth: GALLERY_SEARCH_BORDER_PX,
                    fontFamily: '"Roboto Mono", ui-monospace, monospace',
                  }}
                  placeholder="Filter…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setActiveInput(true)}
                  onBlur={() => setTimeout(() => setActiveInput(false), 150)}
                  aria-label="Filter gallery"
                  autoComplete="off"
                />
              </div>
              {activeInput && dropdownRows.length > 0 && (
                <ul
                  className="scrollbar-hide absolute left-0 right-0 top-full mt-0 bg-white border border-black border-t-0 z-20 max-h-[200px] overflow-y-auto rounded-none"
                  style={{
                    borderWidth: GALLERY_SEARCH_BORDER_PX,
                    borderTopWidth: 0,
                    fontFamily: '"Roboto Mono", ui-monospace, monospace',
                  }}
                >
                  {dropdownRows.map((row) => (
                    <li
                      key={row.key}
                      className="px-3 py-2 cursor-pointer hover:bg-gray-100 text-sm"
                      onMouseDown={() => {
                        setQuery(row.text);
                        writeFilterRecent(row.text);
                        setActiveInput(false);
                      }}
                    >
                      {row.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div
            ref={gridRef}
            className="scrollbar-hide grid grid-cols-2 md:grid-cols-3 gap-x-2 gap-y-4 md:gap-x-3 md:gap-y-5 flex-1 content-start min-h-0 overflow-y-auto overscroll-contain scroll-pt-2 pt-3 sm:pt-4 [grid-auto-rows:minmax(0,auto)] justify-items-center"
            onWheel={(e) => {
              if (!onSwipeToHome) return;
              if (e.deltaY >= -36) return;
              const el = gridRef.current;
              if (!el) return;
              const atTop = el.scrollTop <= 2;
              if (!atTop) return;
              e.preventDefault();
              onSwipeToHome();
            }}
            onTouchStart={(e) => {
              touchStartYRef.current = e.touches[0]?.clientY ?? null;
            }}
            onTouchEnd={(e) => {
              if (!onSwipeToHome) return;
              const start = touchStartYRef.current;
              const end = e.changedTouches[0]?.clientY ?? null;
              touchStartYRef.current = null;
              if (start == null || end == null) return;
              const dy = end - start;
              if (dy >= -46) return;
              const el = gridRef.current;
              if (!el) return;
              const atTop = el.scrollTop <= 2;
              if (!atTop) return;
              onSwipeToHome();
            }}
          >
            {pageSlice.map((b) => {
              const title = galleryBuildingTitle(b.log);
              const displaySrc = mapAlignedBuildingSrc(b);
              const moon = (b.log.moon ?? '').trim();
              const moonOk = moon.length >= 1 && moon.length <= 64;
              const av = normalizeAvatarVariant(b.log.avatarVariant);
              return (
                <div
                  key={b.id}
                  className="flex min-h-0 w-full min-w-0 max-w-[min(100%,280px)] flex-col items-center gap-0 justify-self-center"
                >
                  <div className="relative flex w-full min-h-0 justify-center overflow-hidden">
                    <button
                      type="button"
                      className="group flex w-full cursor-pointer flex-col items-center overflow-hidden rounded-none border-0 bg-transparent px-0.5 pb-0 pt-0.5 shadow-none transition-transform duration-200 ease-out hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5F6D3B]/35"
                      onClick={() => onOpenBuilding(b.id)}
                    >
                      <div className={thumbBoxClass}>
                        <div
                          className="w-full transition-[filter] duration-200 ease-out group-hover:drop-shadow-[0_0_22px_rgba(255,255,255,0.98)] group-hover:brightness-[1.04]"
                          onMouseEnter={(e) => {
                            if (moonOk) {
                              setMoonHover({
                                el: e.currentTarget,
                                moon: b.log.moon ?? '',
                                avatarVariant: av,
                              });
                            }
                          }}
                          onMouseLeave={() => setMoonHover({ el: null, moon: '', avatarVariant: 0 })}
                        >
                          {displaySrc ? (
                            <GalleryBuildingThumb src={displaySrc} />
                          ) : (
                            <div className={THUMB_FRAME}>
                              <span className="text-xs text-[#332115]/70">Generating…</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  </div>
                  <p
                    className="m-0 mt-1 line-clamp-2 min-h-[3.4rem] w-full shrink-0 break-words px-2 pt-1 text-center text-[14px] leading-snug"
                    style={{
                      color: LABEL_OLIVE,
                      fontFamily: '"Roboto Mono", ui-monospace, monospace',
                      fontWeight: 400,
                    }}
                    title={title || undefined}
                  >
                    {title || '—'}
                  </p>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div
                className="col-span-full text-center text-sm py-12"
                style={{ color: '#756F6C', fontFamily: '"Helvetica Neue", sans-serif' }}
              >
                No matching buildings.
              </div>
            )}
          </div>

          <GalleryMoonPopover
            anchorEl={moonHover.el}
            moon={moonHover.moon}
            avatarVariant={moonHover.avatarVariant}
          />

          <div
            className="flex shrink-0 items-center justify-center gap-4 pt-3 pb-1"
            style={{ fontFamily: '"Roboto Mono", ui-monospace, monospace' }}
          >
              <button
                type="button"
                className="border-0 bg-transparent p-1 text-[#332115] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                aria-label="Previous page"
                disabled={carouselPage <= 0}
                onClick={() => setCarouselPage((p) => Math.max(0, p - 1))}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <div className="flex items-center gap-4">
                {Array.from({ length: dotCount }, (_, i) => {
                  const isPageDot = i < totalPages;
                  const isActivePage = isPageDot && carouselPage === i;
                  return (
                    <button
                      key={`dot-${i}`}
                      type="button"
                      aria-label={
                        isPageDot
                          ? `Page ${i + 1}`
                          : carouselPage >= totalPages - 1
                            ? 'First page'
                            : 'Last page'
                      }
                      aria-current={isActivePage ? 'true' : undefined}
                      onClick={() => {
                        if (isPageDot) setCarouselPage(i);
                        else {
                          setCarouselPage((p) => (p >= totalPages - 1 ? 0 : totalPages - 1));
                        }
                      }}
                      className="h-2.5 w-2.5 shrink-0 rounded-full border transition-colors cursor-pointer"
                      style={{
                        borderColor: CAROUSEL_DOT,
                        backgroundColor: isActivePage ? CAROUSEL_DOT : 'transparent',
                      }}
                    />
                  );
                })}
              </div>
              <button
                type="button"
                className="border-0 bg-transparent p-1 text-[#332115] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                aria-label="Next page"
                disabled={carouselPage >= totalPages - 1}
                onClick={() => setCarouselPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
          </div>
        </div>
      </div>

      <TravelHeatmapCalendar buildings={buildings} />
    </section>
  );
};
