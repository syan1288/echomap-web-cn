
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as Tone from 'tone';
import { generateImageWithPrompt } from './services/geminiService';
import { assertFileSizeOk } from './shared/domain/uploads/uploadLimits';
import { ImageMarker } from './components/ImageMarker';
import { PoiDotMarker } from './components/PoiDotMarker';
import { Toolbar } from './components/Toolbar';
import { ResetConfirmModal } from './components/ResetConfirmModal';
import { ImportConfirmModal } from './components/ImportConfirmModal';
import { MemoryCards } from './components/MemoryCards';
import { PhotoPreviewModal } from './components/PhotoPreviewModal';
import { TravelLogModal } from './components/TravelLogModal';
import { HelpModal } from './components/HelpModal';
import { useLocalization } from './context/LocalizationContext';
import { SearchControl } from './components/SearchControl';
import { ClusterBubble, Cluster } from './components/ClusterBubble';
import { EchoSidebar } from './components/EchoSidebar';
import { BuildingConnectionsOverlay } from './components/BuildingConnectionsOverlay';
import Shuffle from './components/Shuffle';
import { AddBuildingModal } from './components/AddBuildingModal';
import { GallerySection } from './components/GallerySection';
import { continentKeyFromLatLng } from './shared/domain/geo/geoStats';
import { buildGeocodeQueries, hasGeographicHint } from './shared/domain/geo/geoFromBuildingName';
import { GalleryDetailModals } from './components/GalleryDetailModals';
import { MemoryPhotoModal } from './components/MemoryPhotoModal';
import { MemoryAudioModal } from './components/MemoryAudioModal';
import { AuthPanel } from './components/AuthPanel';
import { resolveSessionAnchor, formatCityCountry } from './services/sessionGeo';
import { normalizeLog } from './shared/domain/memory/normalizeLog';
import { DEFAULT_BUILDING_STYLE, isBuildingStyleId, type BuildingStyleId } from './shared/domain/building-style/buildingStyle';
import type { AudioEntry, LogData, PhotoData, ProcessedImage } from './web/app/webMemoryTypes';
import { useAuth } from './context/AuthContext';
import {
  loadAllCloudBuildings,
  saveBuildingToCloud,
  deleteBuildingFromCloud,
  isSupabaseConfigured,
} from './services/cloudBuildings';
import { apiUrl } from './lib/apiBase';
import type { ImageProvider, ImageProviderAvailability } from './services/imageProviderAvailability';
import { buildReverseGeocodeUrl, deploymentConfig } from './lib/deploymentConfig';
import { parseReverseGeocodePlace } from './shared/domain/geo/locationParsers';
import { BASEMAP_THEME_OPTIONS, type BasemapThemeId, MapboxAdapter, createMapBounds } from './lib/mapboxAdapter';
import { loadMapbox } from './lib/mapboxLoader';

/** 侧栏地理文案：Roboto 作为 Google Sans 的可加载替代 */
const FONT_GOOGLE_SANS = '"Roboto", "Google Sans", system-ui, sans-serif';

// --- TYPE DECLARATIONS for global libraries ---
declare const EXIF: any;

// --- SOUND DEFINITIONS ---
const synth = new Tone.Synth({
  oscillator: { type: 'sine' },
  envelope: {
    attack: 0.01,
    decay: 0.2,
    sustain: 0,
    release: 0.2,
  },
}).toDestination();


const ensureAudioContext = async () => {
    if (Tone.context.state !== 'running') {
        await Tone.start();
    }
};


// --- PROMPT DEFINITIONS ---
const PROMPT_STYLE_GUIDANCE = "The style must be 3D isometric pixel art. The object must be isolated on a plain white background with no shadows. Do not include any explanatory text in the response; output only the final image.";
const EDIT_PROMPT_TEMPLATE = (input: string) => `${input}. ${PROMPT_STYLE_GUIDANCE}`;


const IMAGE_WIDTH = 120; 

const COLOR_DISTANCE_THRESHOLD = 32;
const MOVE_AMOUNT = 0.001; // Lat/Lng move amount for keyboard
const CLUSTER_ZOOM_THRESHOLD = 6;
const CLUSTER_RADIUS_PX = 90;
/** 小于等于该 zoom 时地图仅显示黑色 POI 圆点，不显示建筑立绘 */
const POI_DOT_ZOOM_THRESHOLD = 5;
const MAP_ICON_BORDER_PX = 1.5;
/** Demo landmarks (locked). Set to false to start with an empty map. */
const ECHO_SEED_DEMO_BUILDINGS =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('seedDemo');
const ECHO_PROMO_SCENE =
  typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('promoScene') : null;

/** 空状态文案在可被滚轮/拖拽/地图点击等「被动」清除前，最短展示时长（ms） */
const EMPTY_HINT_PASSIVE_MS = 18_000;

export type MapDisplayItem = ProcessedImage | Cluster;

interface ImageProcessingResult {
    transparentImage: HTMLImageElement;
    contentBounds: { x: number; y: number; width: number; height: number; };
}

interface PhotoPreviewState {
    memoryId: number;
    photos: PhotoData[];
    currentIndex: number;
}

type PersistCloudImageOptions = {
  notify?: boolean;
};

// --- HELPER FUNCTIONS ---

const getExifData = (file: File): Promise<{ lat: number; lng: number; date: string } | null> => {
    return new Promise((resolve) => {
        EXIF.getData(file, function(this: any) {
            try {
                const lat = EXIF.getTag(this, "GPSLatitude");
                const lng = EXIF.getTag(this, "GPSLongitude");
                const latRef = EXIF.getTag(this, "GPSLatitudeRef");
                const lngRef = EXIF.getTag(this, "GPSLongitudeRef");

                let dateStr: string | null = EXIF.getTag(this, "DateTimeOriginal");
                if (dateStr) {
                    const parts = dateStr.split(' ')[0].split(':');
                    dateStr = `${parts[0]}-${parts[1]}-${parts[2]}`;
                } else {
                    dateStr = new Date().toISOString().split('T')[0];
                }

                if (!lat || !lng || !latRef || !lngRef) {
                    resolve(null);
                    return;
                }

                const dmsToDd = (dms: number[], ref: 'N' | 'S' | 'E' | 'W'): number => {
                    const dd = dms[0] + dms[1] / 60 + dms[2] / 3600;
                    return (ref === 'S' || ref === 'W') ? -dd : dd;
                };

                const latitude = dmsToDd(lat, latRef);
                const longitude = dmsToDd(lng, lngRef);
                
                resolve({ lat: latitude, lng: longitude, date: dateStr });

            } catch(e) {
                console.error("Error reading EXIF data", e);
                resolve(null);
            }
        });
    });
};

const reverseGeocode = async (lat: number, lng: number, lang: 'en' | 'zh'): Promise<string> => {
    try {
        const response = await fetch(buildReverseGeocodeUrl(lat, lng, lang, 18));
        if (!response.ok) return "An interesting place";

        const data = await response.json();
        return parseReverseGeocodePlace(data) || "A wonderful location";

    } catch (error) {
        console.error("Reverse geocoding failed", error);
        return "A wonderful location";
    }
};


const processImageForTransparency = (imageUrl: string): Promise<ImageProcessingResult> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return reject(new Error('Could not get 2d context'));
      
      ctx.drawImage(img, 0, 0);
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        const corners = [
          [0, 0],
          [canvas.width - 1, 0],
          [0, canvas.height - 1],
          [canvas.width - 1, canvas.height - 1],
        ] as const;
        const cornerColors = corners.map(([x, y]) => {
          const idx = (y * canvas.width + x) * 4;
          return [data[idx], data[idx + 1], data[idx + 2]] as const;
        });
        const bgR = Math.round(cornerColors.reduce((sum, [r]) => sum + r, 0) / cornerColors.length);
        const bgG = Math.round(cornerColors.reduce((sum, [, g]) => sum + g, 0) / cornerColors.length);
        const bgB = Math.round(cornerColors.reduce((sum, [, , b]) => sum + b, 0) / cornerColors.length);
        const thresholdSquared = COLOR_DISTANCE_THRESHOLD * COLOR_DISTANCE_THRESHOLD;
        const visited = new Uint8Array(canvas.width * canvas.height);
        const queue: number[] = [];

        const nearWhite = (r: number, g: number, b: number) => r >= 244 && g >= 244 && b >= 244;
        const nearBackground = (r: number, g: number, b: number) =>
          (r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2 < thresholdSquared || nearWhite(r, g, b);

        const pushIfMatch = (x: number, y: number) => {
          if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
          const pos = y * canvas.width + x;
          if (visited[pos]) return;
          const idx = pos * 4;
          if (!nearBackground(data[idx], data[idx + 1], data[idx + 2])) return;
          visited[pos] = 1;
          queue.push(pos);
        };

        let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;

        for (let x = 0; x < canvas.width; x++) {
          pushIfMatch(x, 0);
          pushIfMatch(x, canvas.height - 1);
        }
        for (let y = 0; y < canvas.height; y++) {
          pushIfMatch(0, y);
          pushIfMatch(canvas.width - 1, y);
        }

        while (queue.length) {
          const pos = queue.shift()!;
          const idx = pos * 4;
          data[idx + 3] = 0;
          const x = pos % canvas.width;
          const y = Math.floor(pos / canvas.width);
          pushIfMatch(x - 1, y);
          pushIfMatch(x + 1, y);
          pushIfMatch(x, y - 1);
          pushIfMatch(x, y + 1);
        }

        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] === 0) continue;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          if (nearWhite(r, g, b)) {
            data[i + 3] = 0;
          }
        }
        
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                if (data[(y * canvas.width + x) * 4 + 3] > 0) {
                    if (x < minX) minX = x; if (x > maxX) maxX = x;
                    if (y < minY) minY = y; if (y > maxY) maxY = y;
                }
            }
        }

        ctx.putImageData(imageData, 0, 0);
        
        const transparentImage = new Image();
        transparentImage.src = canvas.toDataURL();
        transparentImage.onload = () => {
            const contentBounds = (maxX >= minX && maxY >= minY) 
                ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
                : { x: 0, y: 0, width: canvas.width, height: canvas.height };
            resolve({ transparentImage, contentBounds });
        };
        transparentImage.onerror = (err) => reject(err);
      } catch (error) {
         console.error("Error processing image for transparency:", error);
         resolve({ transparentImage: img, contentBounds: { x: 0, y: 0, width: img.width, height: img.height }});
      }
    };
    img.onerror = (err) => reject(err);
    img.src = imageUrl;
  });
};

export const imageElementToFile = async (imageElement: HTMLImageElement, fileName: string): Promise<File> => {
    const canvas = document.createElement('canvas');
    canvas.width = imageElement.naturalWidth;
    canvas.height = imageElement.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Could not get 2d context for image conversion");
    ctx.drawImage(imageElement, 0, 0);
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (blob) resolve(new File([blob], fileName, { type: 'image/png' }));
            else reject(new Error("Canvas to Blob conversion failed"));
        }, 'image/png');
    });
};

// --- DATA CONVERSION HELPERS for EXPORT/IMPORT ---
const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

const imageElementToBase64 = (imageElement: HTMLImageElement): string => {
    const canvas = document.createElement('canvas');
    canvas.width = imageElement.naturalWidth;
    canvas.height = imageElement.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Could not get 2d context for image conversion");
    ctx.drawImage(imageElement, 0, 0);
    return canvas.toDataURL('image/png');
};

const base64ToImageElement = (base64: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(err);
        img.src = base64;
    });
};

const base64ToFile = async (base64: string, filename: string): Promise<File> => {
    const res = await fetch(base64);
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type });
};

const makeAudioEntryFromFile = (
  file: File,
  kind: 'audio' | 'music',
  source: AudioEntry['source'] = 'upload',
  title?: string
): AudioEntry => ({
  id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${kind}-${Date.now()}`,
  kind,
  title: title || file.name,
  url: URL.createObjectURL(file),
  createdAt: new Date().toISOString(),
  source,
  file,
});


const App: React.FC = () => {
  const { t, language, toggleLanguage } = useLocalization();
  const { user } = useAuth();
  const [images, setImages] = useState<ProcessedImage[]>([]);
  const autoLoadedUidRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [draggingImage, setDraggingImage] = useState<{ id: number; startX: number; startY: number; startLat: number; startLng: number } | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<number | null>(null);
  const nextId = useRef(0);
  const previewImageCache = useRef<Record<number, HTMLImageElement>>({});
  const prevImagesRef = useRef<ProcessedImage[]>([]);
  const latestImagesRef = useRef<ProcessedImage[]>([]);
  const previousImagesForCloudSaveRef = useRef<ProcessedImage[]>([]);
  const cloudSavedSignatureRef = useRef<Map<number, string>>(new Map());
  const cloudSaveInFlightRef = useRef<Set<number>>(new Set());
  const cloudSaveQueuedRef = useRef<Map<number, { img: ProcessedImage; options?: PersistCloudImageOptions }>>(new Map());
  const cloudSaveRetryAttemptRef = useRef<Map<number, string>>(new Map());
  const cloudSaveRetryUidRef = useRef<string | null>(null);
  const [animationTick, setAnimationTick] = useState(0);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [importFileContent, setImportFileContent] = useState<string | null>(null);
  const [placementInfo, setPlacementInfo] = useState<{
    file: File;
    buildingName?: string;
    buildingStyle?: string;
    stylePrompt?: string;
  } | null>(null);
  const [mapExplored, setMapExplored] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [photoPreviewState, setPhotoPreviewState] = useState<PhotoPreviewState | null>(null);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showMemoryPhotoModal, setShowMemoryPhotoModal] = useState(false);
  const [showMemoryAudioModal, setShowMemoryAudioModal] = useState(false);
  const [imageProvider, setImageProvider] = useState<ImageProvider>('gemini');
  const [isLoading, setIsLoading] = useState<{ active: boolean; message: string } | null>(null);

  const [echoTab, setEchoTab] = useState<'home' | 'gallery'>('home');
  const [showAddBuildingModal, setShowAddBuildingModal] = useState(false);
  const [hoveredImageId, setHoveredImageId] = useState<number | null>(null);
  const [galleryDetailId, setGalleryDetailId] = useState<number | null>(null);
  const [galleryOpenM03, setGalleryOpenM03] = useState(false);
  const [galleryOpenM04, setGalleryOpenM04] = useState(false);
  const sessionAnchorRef = useRef<{ lat: number; lng: number } | null>(null);
  const seedDoneRef = useRef(false);
  /** 空状态文案展示期间，与 EMPTY_HINT_PASSIVE_MS 对齐的解锁时间戳 */
  const emptyHintVisibleRef = useRef(false);
  const passiveDismissUnlockAtRef = useRef(0);

  const persistCloudImage = useCallback(
    async (img: ProcessedImage, options?: PersistCloudImageOptions) => {
      if (!isCloudSaveEligible(img)) return;
      const uid = user?.id;
      if (!isSupabaseConfigured) {
        if (img.isLocked || options?.notify) setToastMessage(t('cloudSaveUnavailable'));
        return;
      }
      if (!uid) {
        if (img.isLocked || options?.notify) setToastMessage(t('cloudSaveAuthRequired'));
        return;
      }

      const signature = cloudSyncSignature(img);
      if (!signature) return;
      if (cloudSavedSignatureRef.current.get(img.id) === signature) return;
      if (cloudSaveInFlightRef.current.has(img.id)) {
        cloudSaveQueuedRef.current.set(img.id, { img, options });
        return;
      }

      cloudSaveInFlightRef.current.add(img.id);
      try {
        const cloudId = await saveBuildingToCloud(img, uid);
        cloudSavedSignatureRef.current.set(img.id, signature);
        setImages((prev) =>
          prev.map((entry) => (entry.id === img.id ? { ...entry, cloudId } : entry))
        );
        if (options?.notify) {
          setToastMessage(t('cloudPushOk', { count: 1 }));
        }
      } catch (error) {
        console.error('cloud autosave failed', error);
        const kind = cloudSaveErrorKind(error);
        if (kind === 'auth') {
          setToastMessage(t('cloudSaveAuthRequired'));
        } else if (kind === 'quota') {
          setToastMessage(t('cloudSaveQuotaFailed', { reason: cloudSaveErrorReason(error) }));
        } else {
          setToastMessage(t('cloudSaveFailedWithReason', { reason: cloudSaveErrorReason(error) }));
        }
      } finally {
        cloudSaveInFlightRef.current.delete(img.id);
        const queued = cloudSaveQueuedRef.current.get(img.id);
        if (queued) {
          cloudSaveQueuedRef.current.delete(img.id);
          const queuedSignature = cloudSyncSignature(queued.img);
          if (
            isCloudSaveEligible(queued.img) &&
            queuedSignature &&
            cloudSavedSignatureRef.current.get(img.id) !== queuedSignature
          ) {
            window.setTimeout(() => {
              void persistCloudImage(queued.img, queued.options);
            }, 0);
          }
        }
      }
    },
    [t, user?.id]
  );

  const mapRef = useRef<any | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const homeTransitionTouchStartYRef = useRef<number | null>(null);
  const [statsFade, setStatsFade] = useState(0.48);
  const [mapState, setMapState] = useState({ isReady: false });
  const [mapViewportTick, setMapViewportTick] = useState(0);
  const [mapZoom, setMapZoom] = useState(2);
  const [basemapTheme, setBasemapTheme] = useState<BasemapThemeId>('mist');
  const [showBasemapMenu, setShowBasemapMenu] = useState(false);
  /** 仅开发：检测 Vite 中间件 /api 是否可达与生成凭证 */
  const [devEchoApiHint, setDevEchoApiHint] = useState<string | null>(null);
  const [imageProviderAvailability, setImageProviderAvailability] = useState<ImageProviderAvailability | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(apiUrl('/api/echo-health'));
        if (cancelled) return;
        if (!r.ok) {
          if (import.meta.env.DEV) {
            setDevEchoApiHint(
              'DEV: 无法访问本地 API（/api/* 404）。请在 echomap-web 目录运行 npm run dev 或 npm run preview，并用终端打印的 http://localhost 地址打开，勿直接打开 dist/index.html。'
            );
          }
          return;
        }
        const j = (await r.json()) as {
          generateConfigured?: boolean;
          providers?: Partial<Record<ImageProvider, boolean>>;
          env?: {
            hasGeminiApiKey?: boolean;
            hasJimengKeys?: boolean;
            hasGoogleCloudProject?: boolean;
            hasGoogleApplicationCredentials?: boolean;
          };
        };
        const inferredProviders: ImageProviderAvailability = {
          gemini:
            j.providers?.gemini ??
            Boolean(j.env?.hasGeminiApiKey || (j.env?.hasGoogleCloudProject && j.env?.hasGoogleApplicationCredentials)),
          jimeng: j.providers?.jimeng ?? Boolean(j.env?.hasJimengKeys),
        };
        setImageProviderAvailability(inferredProviders);
        if (!import.meta.env.DEV) return;
        if (!j.generateConfigured) {
          setDevEchoApiHint(
            'DEV: 未配置 Gemini / OpenAI / 即梦任一出图凭证（.env）。地名搜索仍可用；3D 生成会失败直至补齐至少一种。'
          );
          return;
        }
        setDevEchoApiHint(null);
      } catch {
        if (!cancelled && import.meta.env.DEV) {
          setDevEchoApiHint('DEV: 无法连接本地 API。请在 echomap-web 下运行 npm run dev。');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!imageProviderAvailability) return;
    if (imageProviderAvailability[imageProvider] !== false) return;
    const fallback = (['jimeng', 'gemini'] as const).find(
      (provider) => imageProviderAvailability[provider]
    );
    if (fallback && fallback !== imageProvider) {
      setImageProvider(fallback);
    }
  }, [imageProvider, imageProviderAvailability]);

  const selectedImage = useMemo(() =>
    selectedImageId !== null ? images.find(img => img.id === selectedImageId) : null,
    [images, selectedImageId]
  );

  const itemsToDisplay = useMemo((): MapDisplayItem[] => {
    if (!mapRef.current || !mapState.isReady) {
        return images;
    }

    const zoom = mapZoom;
    if (zoom <= POI_DOT_ZOOM_THRESHOLD) {
      return images;
    }
    if (zoom > CLUSTER_ZOOM_THRESHOLD) {
      return images;
    }

    const clusters: Cluster[] = [];
    const clusteredImageIds = new Set<number>();

    const imagesToProcess = [...images].sort((a, b) => b.id - a.id);

    for (const image of imagesToProcess) {
      if (clusteredImageIds.has(image.id)) {
        continue;
      }

      const currentClusterMembers: ProcessedImage[] = [image];
      const screenPoint1 = mapRef.current.latLngToContainerPoint([image.lat, image.lng]);

      for (const otherImage of imagesToProcess) {
        if (otherImage.id === image.id || clusteredImageIds.has(otherImage.id)) {
          continue;
        }

        const screenPoint2 = mapRef.current.latLngToContainerPoint([otherImage.lat, otherImage.lng]);
        const distance = Math.sqrt(
          Math.pow(screenPoint1.x - screenPoint2.x, 2) +
          Math.pow(screenPoint1.y - screenPoint2.y, 2)
        );

        if (distance < CLUSTER_RADIUS_PX) {
          currentClusterMembers.push(otherImage);
        }
      }

      if (currentClusterMembers.length > 1) {
        currentClusterMembers.forEach(member => clusteredImageIds.add(member.id));
        
        const latitudes = currentClusterMembers.map(img => img.lat);
        const longitudes = currentClusterMembers.map(img => img.lng);

        clusters.push({
          id: `cluster-${image.id}`,
          images: currentClusterMembers,
          lat: latitudes.reduce((a, b) => a + b, 0) / latitudes.length,
          lng: longitudes.reduce((a, b) => a + b, 0) / longitudes.length,
          count: currentClusterMembers.length,
          representativeImage: image,
        });
      }
    }
    
    const unclusteredImages = images.filter(img => !clusteredImageIds.has(img.id));

    return [...clusters, ...unclusteredImages];
  }, [images, mapState.isReady, mapZoom]);
  
  // --- MAP INITIALIZATION ---
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    let cancelled = false;
    void (async () => {
      try {
        const mapboxgl = await loadMapbox(deploymentConfig.mapboxAccessToken);
        if (cancelled || !mapContainerRef.current) return;
        const map = new MapboxAdapter(mapboxgl, mapContainerRef.current, {
          center: [15, 0],
          zoom: 2,
          minZoom: 1,
          maxZoom: 18,
          style: deploymentConfig.mapboxStyle,
          fallbackStyle: createRasterFallbackStyle(
            deploymentConfig.mapTileUrl,
            deploymentConfig.mapTileAttribution
          ),
        });
        map.setBasemapTheme(basemapTheme);
        map.applyEditorialStyle();
        let rafId = 0;
        const updateViewport = () => {
          if (rafId) return;
          rafId = window.requestAnimationFrame(() => {
            rafId = 0;
            setMapViewportTick((tick) => tick + 1);
          });
        };
        const updateZoom = () => {
          setMapZoom(map.getZoom());
          updateViewport();
        };
        map.on('move', updateViewport);
        map.on('moveend', updateViewport);
        map.on('zoom', updateZoom);
        mapRef.current = map;
        map.whenReady(() => {
          const kick = () => map.invalidateSize();
          kick();
          requestAnimationFrame(kick);
          window.setTimeout(kick, 120);
          window.setTimeout(kick, 450);
          window.setTimeout(kick, 900);
        });
        setMapZoom(map.getZoom());
        setMapState({ isReady: true });
      } catch (error) {
        console.error('Mapbox init failed', error);
        setToastMessage('Map visual layer failed to load. Please check Mapbox token.');
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.destroy?.();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    mapRef.current?.setBasemapTheme?.(basemapTheme);
  }, [basemapTheme]);

  useEffect(() => {
    if (!mapState.isReady || !mapRef.current) return;
    let cancelled = false;
    void (async () => {
      const anchor = await resolveSessionAnchor();
      if (cancelled || !mapRef.current) return;
      sessionAnchorRef.current = anchor;
      const m = mapRef.current;
      m.setView([anchor.lat, anchor.lng], 5);
      requestAnimationFrame(() => {
        m.invalidateSize();
        window.setTimeout(() => m.invalidateSize(), 180);
        window.setTimeout(() => m.invalidateSize(), 520);
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [mapState.isReady]);

  /** 首次进入 / 侧栏切换后容器尺寸变化时补全瓦片 */
  useEffect(() => {
    const map = mapRef.current;
    const el = mapContainerRef.current;
    if (!mapState.isReady || !map || !el) return;
    const fix = () => {
      map.invalidateSize();
    };
    fix();
    const t1 = window.setTimeout(fix, 50);
    const t2 = window.setTimeout(fix, 280);
    const t3 = window.setTimeout(fix, 750);
    const ro = new ResizeObserver(() => fix());
    ro.observe(el);
    window.addEventListener('resize', fix);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      ro.disconnect();
      window.removeEventListener('resize', fix);
    };
  }, [mapState.isReady, echoTab]);

  useEffect(() => {
    const visible = !mapExplored && images.length === 0 && !placementInfo && !isLoading;
    emptyHintVisibleRef.current = visible;
    if (visible) {
      passiveDismissUnlockAtRef.current = Date.now() + EMPTY_HINT_PASSIVE_MS;
    } else {
      passiveDismissUnlockAtRef.current = 0;
    }
  }, [mapExplored, images.length, placementInfo, isLoading]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapState.isReady || !map) return;
    const el = map.getContainer();
    /** 拖图 / 滚轮 / 触控缩放：空状态期内延后清除（与 wheel、zoomstart 同一套时间窗） */
    const tryPassiveDismiss = () => {
      if (!emptyHintVisibleRef.current) {
        setMapExplored(true);
        return;
      }
      if (Date.now() < passiveDismissUnlockAtRef.current) return;
      setMapExplored(true);
    };
    const onZoomStart = (e: { originalEvent?: Event }) => {
      if (e?.originalEvent) tryPassiveDismiss();
    };
    map.on('dragstart', tryPassiveDismiss);
    map.on('zoomstart', onZoomStart);
    el.addEventListener('wheel', tryPassiveDismiss, { passive: true });
    return () => {
      map.off('dragstart', tryPassiveDismiss);
      map.off('zoomstart', onZoomStart);
      el.removeEventListener('wheel', tryPassiveDismiss);
    };
  }, [mapState.isReady]);

  // --- Demo buildings (locked / idle by default); white keyed out via processImageForTransparency ---
  /** 延后注入，避免一加载就有建筑导致空状态文案瞬间被 images.length 顶掉 */
  useEffect(() => {
    if (!mapState.isReady || !ECHO_SEED_DEMO_BUILDINGS || seedDoneRef.current) return;

    let cancelled = false;
    const specs = [
      { lat: -33.86, lng: 151.21, src: '/assets/map-building-opera.png', place: 'Sydney, Australia' },
      { lat: 31.23, lng: 121.47, src: '/assets/map-building-stone-wall.png', place: 'Shanghai, China' },
    ];

    const tid = window.setTimeout(() => {
      if (cancelled || seedDoneRef.current) return;
      seedDoneRef.current = true;
      void (async () => {
        for (const s of specs) {
          try {
            const url = new URL(s.src, window.location.origin).href;
            const { transparentImage, contentBounds } = await processImageForTransparency(url);
            if (cancelled) return;
            const im = transparentImage;
            const id = nextId.current++;
            const aspectRatio = im.width / im.height;
            const newWidth = IMAGE_WIDTH;
            const newHeight = IMAGE_WIDTH / aspectRatio;
            const demo: ProcessedImage = {
              id,
              processedImage: im,
              lat: s.lat,
              lng: s.lng,
              width: newWidth,
              height: newHeight,
              isGenerating: false,
              contentBounds,
              flippedHorizontally: false,
              isLocked: true,
              photos: [],
              audioEntries: [],
              log: {
                location: s.place,
                buildingName: s.src.includes('opera') ? 'Sydney Opera House' : 'Stone Wall',
                date: '2018-06-01',
                partner: 'BuBu',
                moon: '🌙',
                musings: 'xxxx what a nice day!',
                avatarVariant: 0,
              },
            };
            setImages((prev) => [...prev, demo]);
          } catch (e) {
            console.error('Seed building failed', e);
          }
        }
      })();
    }, EMPTY_HINT_PASSIVE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(tid);
    };
  }, [mapState.isReady]);

  // --- IMAGE GENERATION & PLACEMENT ---
  const generateFromImage = useCallback(async (
    file: File,
    id: number,
    options?: { buildingName?: string; userPrompt?: string; buildingStyle?: string; stylePrompt?: string; preferredModel?: ImageProvider }
  ) => {
    try {
      const { imageUrl } = await generateImageWithPrompt(file, {
        buildingName: options?.buildingName,
        userPrompt: options?.userPrompt,
        buildingStyle: options?.buildingStyle,
        stylePrompt: options?.stylePrompt,
        preferredModel: options?.preferredModel ?? imageProvider,
      });
      if (!imageUrl) throw new Error("Generation failed, no image returned.");
      
      const { transparentImage, contentBounds } = await processImageForTransparency(imageUrl);
      const aspectRatio = transparentImage.width / transparentImage.height;

      setImages(prev => prev.map(img => {
        if (img.id !== id) return img;
        const newWidth = IMAGE_WIDTH;
        const newHeight = IMAGE_WIDTH / aspectRatio;
        return {
          ...img,
          processedImage: transparentImage,
          showOriginal: false,
          contentBounds,
          width: newWidth,
          height: newHeight,
          isGenerating: false,
          buildingStyle: isBuildingStyleId(options?.buildingStyle)
            ? options.buildingStyle
            : img.buildingStyle ?? DEFAULT_BUILDING_STYLE,
          stylePrompt: options?.stylePrompt ?? img.stylePrompt,
        }
      }));
    } catch (e) {
      console.error(e);
      const detail = e instanceof Error ? e.message : String(e);
      const providerNotConfigured =
        /JIMENG_(?:ACCESS_KEY_ID|SECRET_ACCESS_KEY).*missing|OPENAI_API_KEY.*missing|Gemini API key.*missing/i.test(detail);
      const short = providerNotConfigured
        ? t('imageProviderNotConfigured')
        : language === 'zh'
          ? ''
          : detail.length > 220
            ? `${detail.slice(0, 217)}…`
            : detail;
      setToastMessage([t('toastGenerationFailed'), short].filter(Boolean).join(' '));
      setImages((prev) =>
        prev.map((img) =>
          img.id === id ? { ...img, isGenerating: false, showOriginal: true } : img
        )
      );
    }
  }, [t, imageProvider, language]);

  const addImageAtLatLng = useCallback((
    file: File,
    latlng: { lat: number; lng: number },
    logInfo: { location: string; date: string; buildingNameHint?: string; buildingStyle?: BuildingStyleId; stylePrompt?: string }
  ) => {
    (async () => {
        await ensureAudioContext();
        synth.triggerAttackRelease('C4', '8n');
    })();
    
    const id = nextId.current++;
    const sourcePreviewUrl = URL.createObjectURL(file);
    previewImageCache.current[id] = new Image();
    previewImageCache.current[id].src = sourcePreviewUrl;
    
    const PLACEHOLDER_WIDTH = 120;
    const style = logInfo.buildingStyle ?? DEFAULT_BUILDING_STYLE;
    const newImage: ProcessedImage = {
        id, sourceFile: file, processedImage: null,
        lat: latlng.lat, lng: latlng.lng,
        width: PLACEHOLDER_WIDTH, height: PLACEHOLDER_WIDTH,
        isGenerating: true,
        contentBounds: { x: 0, y: 0, width: PLACEHOLDER_WIDTH, height: PLACEHOLDER_WIDTH },
        flippedHorizontally: false, isLocked: false,
        buildingStyle: style,
        stylePrompt: logInfo.stylePrompt,
        photos: [
          {
            file,
            url: sourcePreviewUrl,
            photo_id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `photo-${id}-0`,
            createdAt: `${logInfo.date}T12:00:00`,
          },
        ],
        audioEntries: [],
        log: {
            location: logInfo.location,
            buildingName: logInfo.buildingNameHint?.trim() || undefined,
            date: logInfo.date,
            partner: '',
            moon: '',
            musings: '',
            avatarVariant: 0,
            landmark_id: id,
        }
    };
    setImages(prev => [...prev, newImage]);
    generateFromImage(file, id, { buildingName: logInfo.buildingNameHint, buildingStyle: style, stylePrompt: logInfo.stylePrompt });
    return id;
  }, [generateFromImage]);
  
  const startImagePlacement = useCallback(
    async (file: File, opts?: { buildingName?: string; buildingStyle?: string; stylePrompt?: string }) => {
      if (!mapState.isReady || !mapRef.current) {
        setToastMessage(t('toastMapNotReady'));
        return;
      }
      const sizeCheck = assertFileSizeOk(file);
      if (!sizeCheck.ok) {
        setToastMessage(t('toastFileTooLarge'));
        return;
      }
      setMapExplored(true);
      const exifData = await getExifData(file);
      if (exifData) {
        const langTag = language === 'zh' ? 'zh-CN' : 'en';
        let locationName = await formatCityCountry(exifData.lat, exifData.lng, langTag);
        if (!locationName) locationName = await reverseGeocode(exifData.lat, exifData.lng, language);
        setToastMessage(`${t('toastLocationFound')} ${locationName}.`);
        mapRef.current.setView([exifData.lat, exifData.lng], 16);
        requestAnimationFrame(() => {
          mapRef.current?.invalidateSize();
          window.setTimeout(() => mapRef.current?.invalidateSize(), 200);
        });
        addImageAtLatLng(file, exifData, {
          location: locationName,
          date: exifData.date,
          buildingNameHint: opts?.buildingName?.trim(),
          buildingStyle: isBuildingStyleId(opts?.buildingStyle) ? opts?.buildingStyle : DEFAULT_BUILDING_STYLE,
          stylePrompt: opts?.stylePrompt,
        });
        return;
      }

      const name = opts?.buildingName?.trim();
      if (!name) {
        setPlacementInfo({ file, buildingStyle: isBuildingStyleId(opts?.buildingStyle) ? opts?.buildingStyle : DEFAULT_BUILDING_STYLE, stylePrompt: opts?.stylePrompt });
        return;
      }

      if (!shouldGeocodeBuildingName(name)) {
        setPlacementInfo({ file, buildingName: name, buildingStyle: isBuildingStyleId(opts?.buildingStyle) ? opts?.buildingStyle : DEFAULT_BUILDING_STYLE, stylePrompt: opts?.stylePrompt });
        setToastMessage(t('toastPlacementNoGeoHint'));
        return;
      }

      const queries = buildGeocodeQueries(name);
      for (const query of queries) {
        try {
          const geoRes = await fetch(apiUrl('/api/geocode'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, centerFromBbox: false }),
          });
          const geo = (await geoRes.json()) as {
            found?: boolean;
            lat?: number;
            lng?: number;
            display_name?: string;
          };
          if (geo.found && typeof geo.lat === 'number' && typeof geo.lng === 'number' && mapRef.current) {
            const langTag = language === 'zh' ? 'zh-CN' : 'en';
            let locationName = await formatCityCountry(geo.lat, geo.lng, langTag);
            if (!locationName) locationName = geo.display_name || name;
            setToastMessage(`${t('toastLocationFound')} ${locationName}.`);
            mapRef.current.setView([geo.lat, geo.lng], 16);
            requestAnimationFrame(() => {
              mapRef.current?.invalidateSize();
              window.setTimeout(() => mapRef.current?.invalidateSize(), 200);
            });
            const date = new Date().toISOString().split('T')[0];
            addImageAtLatLng(file, { lat: geo.lat, lng: geo.lng }, {
              location: locationName,
              date,
              buildingNameHint: name,
              buildingStyle: isBuildingStyleId(opts?.buildingStyle) ? opts?.buildingStyle : DEFAULT_BUILDING_STYLE,
              stylePrompt: opts?.stylePrompt,
            });
            return;
          }
        } catch (e) {
          console.error('Geocode building name failed', e);
        }
      }

      setPlacementInfo({ file, buildingName: name, buildingStyle: isBuildingStyleId(opts?.buildingStyle) ? opts?.buildingStyle : DEFAULT_BUILDING_STYLE, stylePrompt: opts?.stylePrompt });
      setToastMessage(t('toastGeocodeFailedManual'));
    },
    [addImageAtLatLng, language, mapState.isReady, t]
  );

  // Map click handler to deal with placement and selection
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleClick = (e: any) => {
      if (placementInfo) {
        setMapExplored(true);
        const file = placementInfo.file;
        const latlng = e.latlng;
        const date = new Date().toISOString().split('T')[0];

        // UI Update first
        setPlacementInfo(null);
        const newImageId = addImageAtLatLng(file, latlng, {
          date,
          location: t('loadingLocation'),
          buildingNameHint: placementInfo.buildingName,
          buildingStyle: isBuildingStyleId(placementInfo.buildingStyle)
            ? placementInfo.buildingStyle
            : DEFAULT_BUILDING_STYLE,
          stylePrompt: placementInfo.stylePrompt,
        });

        // Geocode and update name later
        (async () => {
          const langTag = language === 'zh' ? 'zh-CN' : 'en';
          let locationName = await formatCityCountry(latlng.lat, latlng.lng, langTag);
          if (!locationName) locationName = await reverseGeocode(latlng.lat, latlng.lng, language);
          setImages(prev => prev.map(img =>
            img.id === newImageId
              ? { ...img, log: { ...img.log, location: locationName } }
              : img
          ));
        })();
        return;
      }

      /** 蒙层 pointer-events-none，点击会落到地图上；在时间窗内不应立刻关掉空状态 */
      if (emptyHintVisibleRef.current && Date.now() < passiveDismissUnlockAtRef.current) {
        setSelectedImageId(null);
        return;
      }
      setMapExplored(true);
      setSelectedImageId(null);
    };

    map.on('click', handleClick);

    return () => {
      map.off('click', handleClick);
    };
  }, [placementInfo, language, addImageAtLatLng, t]);


  // --- EVENT HANDLERS ---
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setMapExplored(true);
    setPlacementInfo(null);
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/') && mapRef.current) {
        const sizeCheck = assertFileSizeOk(file);
        if (!sizeCheck.ok) {
          setToastMessage(t('toastFileTooLarge'));
          return;
        }
        (async () => {
          const exifData = await getExifData(file);
          if (exifData) {
              const langTag = language === 'zh' ? 'zh-CN' : 'en';
              let locationName = await formatCityCountry(exifData.lat, exifData.lng, langTag);
              if (!locationName) locationName = await reverseGeocode(exifData.lat, exifData.lng, language);
              setToastMessage(`${t('toastLocationFound')} ${locationName}.`);
              mapRef.current.setView([exifData.lat, exifData.lng], 16);
              addImageAtLatLng(file, exifData, {location: locationName, date: exifData.date});
          } else {
              setToastMessage(t('toastNoLocationFound'));
              const point = { x: e.clientX, y: e.clientY };
              const latlng = mapRef.current.containerPointToLatLng(point);
              const date = new Date().toISOString().split('T')[0];
              
              const newImageId = addImageAtLatLng(file, latlng, {location: t('loadingLocation'), date});

              const langTag = language === 'zh' ? 'zh-CN' : 'en';
              let locationName = await formatCityCountry(latlng.lat, latlng.lng, langTag);
              if (!locationName) locationName = await reverseGeocode(latlng.lat, latlng.lng, language);
              setImages(prev => prev.map(img => 
                img.id === newImageId 
                  ? { ...img, log: { ...img.log, location: locationName } } 
                  : img
              ));
          }
        })();
      }
    }
  }, [addImageAtLatLng, language, t]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const sizeCheck = assertFileSizeOk(file);
      if (!sizeCheck.ok) {
        setToastMessage(t('toastFileTooLarge'));
        e.target.value = '';
        return;
      }
      startImagePlacement(file);
      e.target.value = '';
    }
  };

  const handleAddPhotoToMemory = useCallback(async (memoryId: number, file: File) => {
    const sizeCheck = assertFileSizeOk(file);
    if (!sizeCheck.ok) {
      setToastMessage(t('toastFileTooLarge'));
      return;
    }
    if (file.type.startsWith('image/')) {
        await ensureAudioContext();
        synth.triggerAttackRelease('G5', '8n');
        const url = URL.createObjectURL(file);
        const photoId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `photo-${memoryId}-${Date.now()}`;
        const newPhoto: PhotoData = { file, url, photo_id: photoId, createdAt: new Date().toISOString() };
        const current = latestImagesRef.current.find((img) => img.id === memoryId);
        if (!current) return;
        const updated = { ...current, photos: [...current.photos, newPhoto] };
        setImages(prev => prev.map(img => img.id === memoryId
            ? updated
            : img
        ));
        void persistCloudImage(updated);
    }
  }, [t, persistCloudImage]);

  const handleSaveAudioEntriesToMemory = useCallback((memoryId: number, entries: AudioEntry[]) => {
    const current = latestImagesRef.current.find((img) => img.id === memoryId);
    if (!current) return;
    const updated = { ...current, audioEntries: entries };
    setImages((prev) =>
      prev.map((img) => (img.id === memoryId ? updated : img))
    );
    void persistCloudImage(updated);
    setShowMemoryAudioModal(false);
  }, [persistCloudImage]);

  const handleDeletePhotoFromMemory = useCallback(
    async (memoryId: number, photoIndex: number) => {
      await ensureAudioContext();
      synth.triggerAttackRelease('A3', '8n');

      const snapshot = images.find((img) => img.id === memoryId);
      const willRemoveBuilding = snapshot && snapshot.photos.length === 1;
      const cloudId = snapshot?.cloudId;
      const uid = user?.id;
      if (willRemoveBuilding && cloudId && uid && isSupabaseConfigured) {
        try {
          await deleteBuildingFromCloud(cloudId, uid);
        } catch (e) {
          console.error('cloud delete', e);
        }
      }

      setImages((prev) => {
        const memory = prev.find((img) => img.id === memoryId);
        if (!memory) return prev;

        if (memory.photos.length === 1) {
          if (selectedImageId === memoryId) {
            setSelectedImageId(null);
          }
          return prev.filter((img) => img.id !== memoryId);
        }

        const updatedPhotos = memory.photos.filter((_, idx) => idx !== photoIndex);
        const updated = { ...memory, photos: updatedPhotos };
        void persistCloudImage(updated);
        return prev.map((img) => (img.id === memoryId ? updated : img));
      });
    },
    [selectedImageId, images, user?.id, persistCloudImage]
  );

  const handleDeletePhotosFromGallery = useCallback(
    (memoryId: number, photoIndexes: number[]) => {
      const current = latestImagesRef.current.find((img) => img.id === memoryId);
      if (!current || current.photos.length <= 1) return;
      const uniqueIndexes = [...new Set(photoIndexes)]
        .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < current.photos.length)
        .sort((a, b) => a - b);
      if (!uniqueIndexes.length) return;
      if (current.photos.length - uniqueIndexes.length < 1) return;
      const removeSet = new Set(uniqueIndexes);
      const updated = {
        ...current,
        photos: current.photos.filter((_, idx) => !removeSet.has(idx)),
      };
      setImages((prev) => prev.map((img) => (img.id === memoryId ? updated : img)));
      void persistCloudImage(updated);
    },
    [persistCloudImage]
  );

  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            setMapExplored(true);
            startImagePlacement(file);
            event.preventDefault(); return;
          }
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [startImagePlacement]);

  const handleInteractionStart = (e: React.PointerEvent<HTMLDivElement>, targetImage: ProcessedImage) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);

    if (selectedImageId !== targetImage.id) {
        setSelectedImageId(targetImage.id);
    }
    
    if (targetImage.isLocked) return;

    setDraggingImage({ 
        id: targetImage.id, 
        startX: e.clientX,
        startY: e.clientY,
        startLat: targetImage.lat,
        startLng: targetImage.lng
    });

    setImages(prev => [...prev.filter(img => img.id !== targetImage.id), targetImage]);
  };

  const handleInteractionMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingImage && mapRef.current) {
        const startPoint = mapRef.current.latLngToContainerPoint([draggingImage.startLat, draggingImage.startLng]);
        const newPoint = { x: startPoint.x + (e.clientX - draggingImage.startX), y: startPoint.y + (e.clientY - draggingImage.startY) };
        const newLatLng = mapRef.current.containerPointToLatLng(newPoint);
        
        setImages(prev => prev.map(img => img.id === draggingImage.id ? {
            ...img,
            lat: newLatLng.lat,
            lng: newLatLng.lng,
        } : img));
    }
  };

  const handleInteractionEnd = useCallback(async () => {
    if (draggingImage) {
      const imageId = draggingImage.id;
      const finalImageState = images.find(img => img.id === imageId);

      setDraggingImage(null);

      if (finalImageState) {
        const langTag = language === 'zh' ? 'zh-CN' : 'en';
        let newLocationName = await formatCityCountry(finalImageState.lat, finalImageState.lng, langTag);
        if (!newLocationName) newLocationName = await reverseGeocode(finalImageState.lat, finalImageState.lng, language);
        setImages(prev => prev.map(img =>
          img.id === imageId
            ? { ...img, log: { ...img.log, location: newLocationName } }
            : img
        ));
      }
    }
  }, [draggingImage, images, language]);

  const handleClusterClick = useCallback((cluster: Cluster) => {
    if (!mapRef.current) return;
    const bounds = createMapBounds(cluster.images.map(img => [img.lat, img.lng] as [number, number]));
    mapRef.current.fitBounds(bounds);
  }, []);

  // --- LIFECYCLE & CLEANUP ---
  useEffect(() => {
    const isGenerating = images.some(img => img.isGenerating);
    let intervalId: number | undefined;
    if (isGenerating) {
        intervalId = window.setInterval(() => setAnimationTick(tick => tick + 1), 200);
    }
    return () => clearInterval(intervalId);
  }, [images]);

  useEffect(() => {
    latestImagesRef.current = images;
    const currentUrls = new Set(images.flatMap(i => i.photos.map(p => p.url)));
    const prevUrls = new Set(prevImagesRef.current.flatMap(i => i.photos.map(p => p.url)));
    
    prevUrls.forEach(url => {
        if (url.startsWith('blob:') && !currentUrls.has(url)) {
            URL.revokeObjectURL(url);
            const entry = Object.entries(previewImageCache.current).find(([, img]) => img.src === url);
            if(entry) delete previewImageCache.current[parseInt(entry[0], 10)];
        }
    });

    prevImagesRef.current = images;
  }, [images]);

  useEffect(() => {
    const prevImagesMap = new Map(previousImagesForCloudSaveRef.current.map(img => [img.id, img]));
    images.forEach(img => {
        const prevImg = prevImagesMap.get(img.id);
        if (prevImg && prevImg.isGenerating && !img.isGenerating) {
            (async () => {
                await ensureAudioContext();
                synth.triggerAttackRelease('C5', '8n');
            })();
            void persistCloudImage(img);
        }
    });
    previousImagesForCloudSaveRef.current = images;
  }, [images, persistCloudImage]);

  useEffect(() => {
    const uid = user?.id ?? null;
    if (cloudSaveRetryUidRef.current === uid) return;
    cloudSaveRetryUidRef.current = uid;
    cloudSaveRetryAttemptRef.current = new Map();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !isSupabaseConfigured) return;
    const candidates = findLockedUnsyncedCloudSaveCandidates(
      images,
      cloudSaveRetryAttemptRef.current
    );
    candidates.forEach((img) => {
      const signature = cloudSyncSignature(img);
      if (!signature) return;
      cloudSaveRetryAttemptRef.current.set(img.id, signature);
      void persistCloudImage(img, { notify: true });
    });
  }, [images, persistCloudImage, user?.id]);

  /** 登录后自动从云端加载地图（关闭手动 push/pull 交互） */
  useEffect(() => {
    const uid = user?.id;
    if (!uid || !isSupabaseConfigured) return;
    if (autoLoadedUidRef.current === uid) return;
    autoLoadedUidRef.current = uid;
    void (async () => {
      try {
        const loaded = await loadAllCloudBuildings(() => nextId.current++, uid);
        loaded.forEach((img) => {
          if (img.photos[0]?.url) {
            previewImageCache.current[img.id] = new Image();
            previewImageCache.current[img.id].src = img.photos[0].url;
          }
        });
        const maxId = loaded.reduce((m, i) => Math.max(m, i.id), 0);
        nextId.current = Math.max(nextId.current, maxId + 1);
        const currentImages = latestImagesRef.current;
        const mergedImages = mergeCloudLoadedImages(currentImages, loaded);
        const lockedLocalDrafts = currentImages.filter(
          (img) => !img.cloudId && img.isLocked && !img.isGenerating && img.processedImage
        );

        cloudSavedSignatureRef.current = new Map(
          loaded
            .map((img) => {
              const signature = cloudSyncSignature(img);
              return signature ? ([img.id, signature] as const) : null;
            })
            .filter((entry): entry is readonly [number, string] => entry !== null)
        );
        setImages(mergedImages);
        setSelectedImageId(null);
        setToastMessage(
          currentImages.some((img) => !img.cloudId)
            ? t('cloudPullOkWithLocalDrafts')
            : t('cloudPullOk')
        );
        lockedLocalDrafts.forEach((img) => {
          void persistCloudImage(img, { notify: true });
        });
      } catch (e) {
        console.error(e);
        setToastMessage(t('cloudPullFailed'));
      }
    })();
  }, [persistCloudImage, user?.id, t]);

  useEffect(() => {
      if (toastMessage) {
          const timer = setTimeout(() => {
              setToastMessage(null);
          }, 5000);
          return () => clearTimeout(timer);
      }
  }, [toastMessage]);

  useEffect(() => {
      if (selectedImageId) {
          const isClustered = itemsToDisplay
              .filter((item): item is Cluster => 'count' in item && 'images' in item)
              .some(cluster => cluster.images.some(img => img.id === selectedImageId));
          
          if (isClustered) {
              setSelectedImageId(null);
          }
      }
  }, [itemsToDisplay, selectedImageId]);

  // --- ACTIONS ---
  const handleDeleteSelected = async () => {
    if (!selectedImage) return;
    await ensureAudioContext();
    synth.triggerAttackRelease('A4', '8n');
    const cloudId = selectedImage.cloudId;
    const uid = user?.id;
    if (cloudId && uid && isSupabaseConfigured) {
      try {
        await deleteBuildingFromCloud(cloudId, uid);
      } catch (e) {
        console.error('cloud delete', e);
      }
    }
    setImages(prev => prev.filter(img => img.id !== selectedImageId));
    setSelectedImageId(null);
  };

  const handleRegenerateSelected = () => {
      if (!selectedImage) return;
      setImages(prev => prev.map(img => img.id === selectedImageId ? {...img, isGenerating: true } : img));
      if (selectedImage.sourceFile) {
          const buildingName =
            selectedImage.log.buildingName?.trim() ||
            selectedImage.log.location?.split(',')[0]?.trim();
          generateFromImage(selectedImage.sourceFile, selectedImage.id, {
            buildingName,
            buildingStyle: selectedImage.buildingStyle ?? DEFAULT_BUILDING_STYLE,
            stylePrompt: selectedImage.stylePrompt,
          });
      }
  };

  const handleEditSelected = async (prompt: string) => {
    if (!selectedImage || !selectedImage.processedImage) return;
    await ensureAudioContext(); synth.triggerAttackRelease('E4', '8n');
    const imageFile = await imageElementToFile(selectedImage.processedImage, `edit_source_${selectedImage.id}.png`);
    setImages(prev => prev.map(img => img.id === selectedImageId ? { ...img, isGenerating: true, sourceFile: imageFile } : img));
    const finalPrompt = EDIT_PROMPT_TEMPLATE(prompt);
    const buildingName =
      selectedImage.log.buildingName?.trim() ||
      selectedImage.log.location?.split(',')[0]?.trim();
    generateFromImage(imageFile, selectedImage.id, {
      userPrompt: finalPrompt,
      buildingName,
      buildingStyle: selectedImage.buildingStyle ?? DEFAULT_BUILDING_STYLE,
      stylePrompt: selectedImage.stylePrompt,
    });
  };

  const handleFlipSelected = async () => {
    if (!selectedImage) return;
    await ensureAudioContext(); synth.triggerAttackRelease('G5', '8n');
    setImages(prev => prev.map(img => img.id === selectedImageId ? { ...img, flippedHorizontally: !img.flippedHorizontally } : img));
  };
  
  const handleDuplicateSelected = async () => {
    if (!selectedImage || !mapRef.current) return;

    await ensureAudioContext(); synth.triggerAttackRelease('C4', '8n');
    const screenPoint = mapRef.current.latLngToContainerPoint([selectedImage.lat, selectedImage.lng]);
    const newScreenPoint = { x: screenPoint.x + 40, y: screenPoint.y + 20 };
    const newLatLng = mapRef.current.containerPointToLatLng(newScreenPoint);
    const newId = nextId.current++;
    const duplicatedImage: ProcessedImage = {
        ...selectedImage,
        id: newId,
        lat: newLatLng.lat,
        lng: newLatLng.lng,
        cloudId: undefined,
    };
    if (previewImageCache.current[selectedImage.id]) {
        previewImageCache.current[newId] = previewImageCache.current[selectedImage.id];
    }
    setImages(prev => [...prev, duplicatedImage]);
    setSelectedImageId(newId);
  };

  const handleScaleSelected = (factor: number) => {
    if (!selectedImage) return;
    setImages(prev => prev.map(img => {
        if (img.id !== selectedImageId) return img;
        return { ...img, width: img.width * factor, height: img.height * factor };
    }));
  };
  
  const handleLockSelected = async () => {
    if (!selectedImage) return;
    const updated = { ...selectedImage, isLocked: true };
    setImages(prev => prev.map(img => img.id === selectedImageId ? updated : img));
    void ensureAudioContext()
      .then(() => synth.triggerAttackRelease('E5', '8n'))
      .catch((error) => console.warn('lock audio skipped', error));
    void persistCloudImage(updated, { notify: true });
  };

  const handleUnlockSelected = async () => {
    if (!selectedImage) return;
    setImages(prev => prev.map(img => img.id === selectedImageId ? { ...img, isLocked: false } : img));
    void ensureAudioContext()
      .then(() => synth.triggerAttackRelease('C5', '8n'))
      .catch((error) => console.warn('unlock audio skipped', error));
  };
  
  const handleViewPhoto = (photoIndex: number) => {
      if (selectedImage) {
        setPhotoPreviewState({ memoryId: selectedImage.id, photos: selectedImage.photos, currentIndex: photoIndex });
      }
  };

  const handlePhotoPreviewNext = () => {
    setPhotoPreviewState(prev => {
        if (!prev) return null;
        const nextIndex = (prev.currentIndex + 1) % prev.photos.length;
        return { ...prev, currentIndex: nextIndex };
    });
  };

  const handlePhotoPreviewPrevious = () => {
    setPhotoPreviewState(prev => {
        if (!prev) return null;
        const prevIndex = (prev.currentIndex - 1 + prev.photos.length) % prev.photos.length;
        return { ...prev, currentIndex: prevIndex };
    });
  };
  
  const handleEditLog = () => setShowLogModal(true);
  
  const handleSaveLog = (updatedLog: LogData) => {
      if (selectedImageId === null) return;
      const current = latestImagesRef.current.find((img) => img.id === selectedImageId);
      if (!current) return;
      const memId =
        updatedLog.memory_id ??
        current.log.memory_id ??
        (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `mem-${current.id}`);
      const updated = {
        ...current,
        log: {
          ...updatedLog,
          memory_id: memId,
          landmark_id: current.id,
        },
      };
      setImages(prev => prev.map(img => img.id === selectedImageId ? updated : img));
      void persistCloudImage(updated);
      setShowLogModal(false);
  };

  const handleAddPhotoClick = () => {
      setShowMemoryPhotoModal(true);
  };

  const handleLocationSelect = useCallback((lat: number, lng: number) => {
    setMapExplored(true);
    if (mapRef.current) {
        const z = Math.max(mapRef.current.getZoom(), 4);
        mapRef.current.setView([lat, lng], z);
    }
  }, []);


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
        
        const currentImage = selectedImageId !== null ? images.find(img => img.id === selectedImageId) : null;

        if (e.key === 'o' && currentImage) {
            if (currentImage && currentImage.sourceFile) {
              e.preventDefault();
              setImages(prev => prev.map(img => img.id === selectedImageId ? { ...img, showOriginal: !img.showOriginal } : img));
            }
            return;
        }

        if (!currentImage || currentImage.isGenerating || currentImage.isLocked) return;

        const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
        if (arrowKeys.includes(e.key)) {
            e.preventDefault();
            (async () => { await ensureAudioContext(); synth.triggerAttackRelease('G4', '8n'); })();
            let newLat = currentImage.lat, newLng = currentImage.lng;
            const zoomFactor = 1 / (mapRef.current.getZoom() ** 2);
            switch (e.key) {
                case 'ArrowUp':    newLat += MOVE_AMOUNT * zoomFactor; break;
                case 'ArrowDown':  newLat -= MOVE_AMOUNT * zoomFactor; break;
                case 'ArrowLeft':  newLng -= MOVE_AMOUNT * zoomFactor; break;
                case 'ArrowRight': newLng += MOVE_AMOUNT * zoomFactor; break;
            }
            setImages(prev => prev.map(img => img.id === selectedImageId ? { ...img, lat: newLat, lng: newLng } : img));
            return;
        }
        switch (e.key) {
            case 'Delete': case 'Backspace': handleDeleteSelected(); break; case 'r': handleRegenerateSelected(); break;
            case 'f': handleFlipSelected(); break; case 'd': handleDuplicateSelected(); break;
            case '=': case '+': handleScaleSelected(1.1); break; case '-': handleScaleSelected(1 / 1.1); break;
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImageId, images, handleScaleSelected]);

  const handleResetCanvas = () => {
    setImages([]); setShowResetConfirm(false); mapRef.current?.setView([20,0], 2);
  };
  
  // --- EXPORT / IMPORT ---
  const handleExport = async () => {
    if (images.length === 0) return;
    setIsLoading({ active: true, message: t('loadingExport') });
    await ensureAudioContext(); synth.triggerAttackRelease('C5', '8n');

    try {
        const serializableImages = await Promise.all(images.map(async (img) => {
            const processedImageBase64 = img.processedImage ? imageElementToBase64(img.processedImage) : null;
            
            const photosData = await Promise.all(img.photos.map(async (photo) => ({
                base64: await fileToBase64(photo.file),
                name: photo.file.name,
                photo_id: photo.photo_id,
                createdAt: photo.createdAt,
            })));

            const audioEntriesData = await Promise.all(
              img.audioEntries.map(async (entry) => ({
                id: entry.id,
                kind: entry.kind,
                title: entry.title,
                createdAt: entry.createdAt,
                source: entry.source,
                url: entry.source === 'builtin' ? entry.url : undefined,
                base64: entry.file ? await fileToBase64(entry.file) : undefined,
                name: entry.file?.name,
              }))
            );

            const { processedImage, photos, audioEntries, sourceFile, cloudId: _omitCloud, ...rest } = img;
            return {
                ...rest,
                landmark_id: img.id,
                processedImageBase64,
                photos: photosData,
                audioEntries: audioEntriesData,
                log: normalizeLog(img.log),
            };
        }));

        const exportData = {
            version: "1.0.0",
            memories: serializableImages,
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'pixel-travel-map.pixmap';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Export failed:", error);
        setToastMessage("Export failed.");
    } finally {
        setIsLoading(null);
    }
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.pixmap')) {
        setToastMessage(t('errorInvalidFile'));
        if (importInputRef.current) importInputRef.current.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        const content = event.target?.result as string;
        setImportFileContent(content);
        setShowImportConfirm(true);
    };
    reader.readAsText(file);
    if (importInputRef.current) importInputRef.current.value = '';
  };
  
  const confirmImport = async () => {
    if (!importFileContent) return;
    
    setShowImportConfirm(false);
    setIsLoading({ active: true, message: t('loadingImport') });
    await ensureAudioContext(); synth.triggerAttackRelease('G5', '8n');
    
    try {
        const data = JSON.parse(importFileContent);
        if (data.version !== "1.0.0" || !Array.isArray(data.memories)) {
            throw new Error("Invalid or unsupported file format.");
        }

        const reconstructedImages: ProcessedImage[] = await Promise.all(
            data.memories.map(async (mem: any): Promise<ProcessedImage> => {
                const newId = nextId.current++;

                const processedImage = mem.processedImageBase64
                    ? await base64ToImageElement(mem.processedImageBase64)
                    : null;
                
                const photos: PhotoData[] = await Promise.all(
                    mem.photos.map(async (photoData: any): Promise<PhotoData> => {
                        const file = await base64ToFile(photoData.base64, photoData.name);
                        const url = URL.createObjectURL(file);
                        const photo_id =
                          photoData.photo_id ??
                          (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : undefined);
                        return { file, url, photo_id, createdAt: photoData.createdAt };
                    })
                );

                const audioEntries: AudioEntry[] = await Promise.all(
                  (mem.audioEntries ?? []).map(async (entryData: any): Promise<AudioEntry> => {
                    if (entryData.base64 && entryData.name) {
                      const file = await base64ToFile(entryData.base64, entryData.name);
                      return {
                        id: entryData.id ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `audio-${newId}`),
                        kind: entryData.kind === 'music' ? 'music' : 'audio',
                        title: entryData.title ?? entryData.name,
                        createdAt: entryData.createdAt ?? new Date().toISOString(),
                        source: entryData.source ?? 'upload',
                        url: URL.createObjectURL(file),
                        file,
                      };
                    }
                    return {
                      id: entryData.id ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `audio-${newId}`),
                      kind: entryData.kind === 'music' ? 'music' : 'audio',
                      title: entryData.title ?? 'Audio',
                      createdAt: entryData.createdAt ?? new Date().toISOString(),
                      source: entryData.source ?? 'builtin',
                      url: entryData.url ?? '',
                    };
                  })
                );
                
                if (photos[0]?.file) {
                    previewImageCache.current[newId] = new Image();
                    previewImageCache.current[newId].src = photos[0].url;
                }

                return {
                    ...mem,
                    id: newId,
                    cloudId: undefined,
                    processedImage,
                    photos,
                    audioEntries,
                    sourceFile: photos[0]?.file,
                    buildingStyle: isBuildingStyleId(mem.buildingStyle)
                      ? mem.buildingStyle
                      : DEFAULT_BUILDING_STYLE,
                    log: mem.log
                      ? normalizeLog(mem.log)
                      : normalizeLog({
                          location: '',
                          buildingName: undefined,
                          date: '',
                          partner: '',
                          moon: '',
                          musings: '',
                          avatarVariant: 0,
                          landmark_id: undefined,
                        }),
                };
            })
        );
        
        setImages(reconstructedImages);
        mapRef.current?.setView([20,0], 2);
        setToastMessage(t('importSuccess'));

    } catch (error) {
        console.error("Import failed:", error);
        setToastMessage("Import failed. Invalid file.");
    } finally {
        setIsLoading(null);
        setImportFileContent(null);
    }
  };


  // --- RENDER ---
  const sortedItems = useMemo(() => 
    [...itemsToDisplay].sort((a, b) => b.lat - a.lat), 
    [itemsToDisplay]
  );

  const mapReferenceOpacity = useMemo(() => 1, []);

  /** Gallery / 热力图：仅展示已在地图上点击 Lock 的建筑；且需有图或照片可展示 */
  const lockedGalleryBuildings = useMemo(
    () =>
      images.filter((i) => {
        if (!i.isLocked) return false;
        if (i.isGenerating) return false;
        if (i.processedImage) return true;
        return Boolean(i.photos?.some((p) => p.url));
      }),
    [images]
  );

  const homeStatusSlot = useMemo(() => {
    const target =
      hoveredImageId !== null
        ? images.find((i) => i.id === hoveredImageId)
        : selectedImage && selectedImage.isLocked
          ? selectedImage
          : null;
    if (!target) return null;
    const ns = target.lat >= 0 ? 'N' : 'S';
    const ew = target.lng >= 0 ? 'E' : 'W';
    const lat = Math.abs(target.lat).toFixed(4);
    const lng = Math.abs(target.lng).toFixed(4);
    const city = target.log.location.split(',')[0]?.trim() || target.log.location;

    const IconCoord = (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 opacity-90" aria-hidden>
        <circle cx="12" cy="12" r="2.5" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
      </svg>
    );
    const IconPin = (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 opacity-90" aria-hidden>
        <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11Z" />
      </svg>
    );

    return (
      <div className="flex flex-wrap justify-center gap-3 text-[13px] leading-snug" style={{ color: '#1A56DB' }}>
        <span className="inline-flex items-center gap-1.5">
          {IconCoord}
          <span style={{ fontFamily: FONT_GOOGLE_SANS, fontWeight: 500 }}>{lat}&nbsp;{ns}°</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          {IconCoord}
          <span style={{ fontFamily: FONT_GOOGLE_SANS, fontWeight: 500 }}>{lng}&nbsp;{ew}°</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          {IconPin}
          <span style={{ fontFamily: FONT_GOOGLE_SANS, fontWeight: 500 }}>In {city}</span>
        </span>
      </div>
    );
  }, [hoveredImageId, selectedImage, images]);

  const galleryStatsSlot = useMemo(() => {
    const list = lockedGalleryBuildings;
    const cityN = (() => {
      const s = new Set<string>();
      list.forEach((i) => {
        const raw = (i.log?.location || '').trim();
        const first = raw.split(',')[0]?.trim();
        if (first) s.add(first);
      });
      return s.size;
    })();
    const countryN = (() => {
      const s = new Set<string>();
      list.forEach((i) => {
        const parts = (i.log?.location || '').split(',').map((x) => x.trim()).filter(Boolean);
        const c = parts.length >= 2 ? parts[parts.length - 1] : '';
        if (c) s.add(c);
      });
      return s.size;
    })();
    const continentN = (() => {
      const s = new Set<string>();
      list.forEach((i) => s.add(continentKeyFromLatLng(i.lat, i.lng)));
      return s.size;
    })();

    const cell = (label: string, n: number) => (
      <div key={label} className="flex flex-col items-center gap-1.5 min-w-[76px]">
        <span
          className="text-[clamp(1.85rem,3.4vw,2.5rem)] leading-none tabular-nums"
          style={{ color: '#0047FF', fontFamily: '"Cormorant Garamond", Georgia, serif', fontWeight: 500 }}
        >
          {n}
        </span>
        <span
          className="text-[11px] leading-tight tracking-wide uppercase not-italic"
          style={{
            color: '#1A56DB',
            fontFamily: FONT_GOOGLE_SANS,
            fontWeight: 500,
          }}
        >
          {label}
        </span>
      </div>
    );

    return (
      <div className="flex flex-wrap justify-center gap-6 w-full" style={{ rowGap: 12 }}>
        {cell('CITY', cityN)}
        {cell('COUNTRY', countryN)}
        {cell('CONTINENT', continentN)}
      </div>
    );
  }, [lockedGalleryBuildings]);

  const handleEchoNavigate = useCallback((tab: 'home' | 'gallery') => {
    const id = tab === 'home' ? 'echo-section-home' : 'echo-section-gallery';
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  const scrollToGallery = useCallback(() => {
    document.getElementById('echo-section-gallery')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  const scrollToHome = useCallback(() => {
    document.getElementById('echo-section-home')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    const el = mainScrollRef.current;
    if (!el) return;
    const run = () => {
      const st = el.scrollTop;
      const o = 0.4 + 0.6 * Math.min(1, st / 120);
      setStatsFade(o);
    };
    run();
    el.addEventListener('scroll', run, { passive: true });
    return () => el.removeEventListener('scroll', run);
  }, []);

  useEffect(() => {
    const root = mainScrollRef.current;
    const home = document.getElementById('echo-section-home');
    const gallery = document.getElementById('echo-section-gallery');
    if (!root || !home || !gallery) return;

    const pickTab = () => {
      const hr = home.getBoundingClientRect();
      const gr = gallery.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const hVis = Math.max(0, Math.min(hr.bottom, vh) - Math.max(hr.top, 0));
      const gVis = Math.max(0, Math.min(gr.bottom, vh) - Math.max(gr.top, 0));
      setEchoTab(hVis >= gVis ? 'home' : 'gallery');
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const best = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (best) {
          setEchoTab(best.target.id === 'echo-section-home' ? 'home' : 'gallery');
        } else {
          pickTab();
        }
      },
      { root, rootMargin: '0px', threshold: [0, 0.05, 0.25, 0.5, 0.75, 1] }
    );

    observer.observe(home);
    observer.observe(gallery);
    root.addEventListener('scroll', pickTab, { passive: true });
    pickTab();

    return () => {
      observer.disconnect();
      root.removeEventListener('scroll', pickTab);
    };
  }, [mapState.isReady]);

  useEffect(() => {
    if (echoTab !== 'home' || !mapRef.current) return;
    const t = window.setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 120);
    return () => window.clearTimeout(t);
  }, [echoTab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showResetConfirm || showImportConfirm) return;
      setShowHelpModal(false);
      setShowAddBuildingModal(false);
      setShowMemoryPhotoModal(false);
      setShowMemoryAudioModal(false);
      setPhotoPreviewState(null);
      setShowLogModal(false);
      setGalleryOpenM03(false);
      setGalleryOpenM04(false);
      setGalleryDetailId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showResetConfirm, showImportConfirm]);

  const handleAddBuildingSave = useCallback(
    (file: File, buildingName: string, buildingStyle: string, stylePrompt: string) => {
      void startImagePlacement(file, { buildingName, buildingStyle, stylePrompt });
    },
    [startImagePlacement]
  );

  const handleMapSurfacePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!selectedImage || !selectedImage.isLocked) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (
        target.closest('[id^="image-"]') ||
        target.closest('[data-selection-overlay]') ||
        target.closest('[data-map-ui]')
      ) {
        return;
      }

      setSelectedImageId(null);
    },
    [selectedImage]
  );

  const galleryBuilding = galleryDetailId !== null ? images.find((i) => i.id === galleryDetailId) : null;
  const isLocateSuccessToast = Boolean(
    toastMessage && toastMessage.startsWith(t('toastLocationFound'))
  );

  return (
    <div className="min-h-screen bg-[#F9F1E2] text-[#332115]">
      <div className="flex flex-col md:flex-row w-full min-h-[100dvh]">
        <EchoSidebar
          activeTab={echoTab}
          onNavigate={handleEchoNavigate}
          imageProvider={imageProvider}
          imageProviderAvailability={imageProviderAvailability}
          onImageProviderChange={setImageProvider}
          statsFade={statsFade}
          homeStatusSlot={homeStatusSlot}
          galleryStatsSlot={galleryStatsSlot}
          footerSlot={
            echoTab === 'home' ? (
              <AuthPanel />
            ) : null
          }
        />

        <div
          ref={mainScrollRef}
          className="scrollbar-hide flex-1 min-w-0 w-full overflow-y-auto overflow-x-hidden overscroll-y-contain scroll-smooth bg-white snap-y snap-proximity md:flex-1 md:min-w-0 h-dvh"
        >
        <section
          id="echo-section-home"
          className="flex h-[100dvh] min-h-[100dvh] w-full shrink-0 snap-start flex-col overflow-hidden bg-white"
          aria-label="Map"
          style={ECHO_PROMO_SCENE === 'gallery' ? { display: 'none' } : undefined}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onPointerMove={handleInteractionMove}
          onPointerUp={handleInteractionEnd}
          onPointerCancel={handleInteractionEnd}
          onPointerLeave={handleInteractionEnd}
        >
        <div
          className="relative flex min-h-0 w-full flex-1 overflow-hidden"
          onPointerDownCapture={handleMapSurfacePointerDown}
        >
        <div className="absolute top-4 right-4 z-[60] flex items-center gap-2 pointer-events-auto" style={{ top: 'calc(env(safe-area-inset-top) + 1.5rem)' }}>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowBasemapMenu((open) => !open)}
              data-map-ui="basemap-theme"
              className="h-[29px] w-[29px] shrink-0 overflow-visible flex items-center justify-center border border-black rounded-full text-black bg-white hover:bg-neutral-50"
              style={{ borderWidth: MAP_ICON_BORDER_PX }}
              aria-label="Change basemap theme"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="13.5" cy="6.5" r=".5" />
                <circle cx="17.5" cy="10.5" r=".5" />
                <circle cx="8.5" cy="7.5" r=".5" />
                <circle cx="6.5" cy="12.5" r=".5" />
                <path d="M12 3a9 9 0 1 0 9 9c0-1.1-.9-2-2-2h-2.2a1.8 1.8 0 0 1-1.8-1.8c0-.5.2-.9.5-1.3l1.1-1.1A2.4 2.4 0 0 0 15 3h-3Z" />
              </svg>
            </button>
            {showBasemapMenu && (
              <div className="absolute right-0 top-10 min-w-[156px] border border-black bg-white px-2 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.1)]">
                {BASEMAP_THEME_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setBasemapTheme(option.id);
                      setShowBasemapMenu(false);
                    }}
                    data-map-ui="basemap-theme-option"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-neutral-100 border-0 bg-transparent"
                    style={{ fontFamily: '"Roboto Mono", ui-monospace, monospace' }}
                  >
                    <span>{option.label}</span>
                    {basemapTheme === option.id ? <span>•</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              const a = sessionAnchorRef.current;
              if (!a || !mapRef.current) {
                setToastMessage('Location anchor not ready yet.');
                return;
              }
              mapRef.current.setView([a.lat, a.lng], Math.max(6, mapRef.current.getZoom()));
            }}
            data-map-ui="back-to-location"
            className="h-[29px] w-[29px] shrink-0 overflow-visible flex items-center justify-center border border-black rounded-full text-black bg-white hover:bg-neutral-50"
            style={{ borderWidth: MAP_ICON_BORDER_PX }}
            aria-label="Back to my location"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 21c4.6-4.1 7-7.4 7-10.2A7 7 0 1 0 5 10.8C5 13.6 7.4 16.9 12 21Z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={toggleLanguage}
            data-map-ui="language-toggle"
            className="h-[29px] w-[29px] shrink-0 overflow-visible flex items-center justify-center border border-black rounded-full text-black bg-white hover:bg-neutral-50 text-[14px] font-semibold leading-none"
            style={{ borderWidth: MAP_ICON_BORDER_PX }}
            aria-label={language === 'en' ? t('switchToChinese') : t('switchToEnglish')}
          >
            {language === 'zh' ? '中' : 'EN'}
          </button>
          <button
            type="button"
            onClick={() => setShowHelpModal(true)}
            data-map-ui="help"
            className="h-[29px] w-[29px] shrink-0 overflow-visible flex items-center justify-center border border-black rounded-full text-black bg-white hover:bg-neutral-50"
            style={{ borderWidth: MAP_ICON_BORDER_PX }}
            aria-label={t('showHelp')}
          >
            <span className="text-[16px] font-medium leading-none" aria-hidden>?</span>
          </button>
        </div>

        <div
          ref={mapContainerRef}
          id="map"
          className="absolute inset-0 z-[1] h-full w-full min-h-[40vh] echo-map-shell"
          style={{ opacity: mapReferenceOpacity }}
        />
        {mapState.isReady && mapRef.current && (
          <BuildingConnectionsOverlay
            map={mapRef.current}
            mapViewportTick={mapViewportTick}
            images={images}
            visible={mapRef.current.getZoom() <= POI_DOT_ZOOM_THRESHOLD}
            basemapTheme={basemapTheme}
          />
        )}

        {mapState.isReady && mapRef.current && (
          <div className="absolute top-4 left-4 z-[60] flex flex-col gap-1 pointer-events-auto" style={{ top: 'calc(env(safe-area-inset-top) + 1.5rem)' }}>
            <button
              type="button"
              data-map-ui="zoom-in"
              className="h-[26px] w-[26px] border border-black bg-white flex items-center justify-center hover:bg-neutral-100"
              style={{ borderWidth: MAP_ICON_BORDER_PX }}
              aria-label="Zoom in"
              onClick={() => {
                setMapExplored(true);
                mapRef.current?.zoomIn();
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </button>
            <button
              type="button"
              data-map-ui="zoom-out"
              className="h-[26px] w-[26px] border border-black bg-white flex items-center justify-center hover:bg-neutral-100"
              style={{ borderWidth: MAP_ICON_BORDER_PX }}
              aria-label="Zoom out"
              onClick={() => {
                setMapExplored(true);
                mapRef.current?.zoomOut();
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14" />
              </svg>
            </button>
          </div>
        )}

        {mapState.isReady && (
            <SearchControl onLocationSelect={handleLocationSelect} />
        )}
        
        {mapState.isReady && mapRef.current && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
                {(() => {
                  const mapZoom = mapRef.current!.getZoom();
                  const showPoiDots = mapZoom <= POI_DOT_ZOOM_THRESHOLD;
                  const markerZoomScale = Math.max(0.36, Math.min(1.14, 0.2 + mapZoom * 0.052));
                  return sortedItems.map((item) => {
                    if ('count' in item && 'images' in item) {
                      return (
                        <ClusterBubble
                          key={item.id}
                          cluster={item}
                          map={mapRef.current!}
                          mapViewportTick={mapViewportTick}
                          onClick={handleClusterClick}
                        />
                      );
                    }
                    const img = item as ProcessedImage;
                    if (showPoiDots) {
                      return (
                        <PoiDotMarker
                          key={img.id}
                          img={img}
                          map={mapRef.current!}
                          mapViewportTick={mapViewportTick}
                          isSelected={selectedImageId === img.id}
                          basemapTheme={basemapTheme}
                          onInteractionStart={handleInteractionStart}
                          onHoverChange={setHoveredImageId}
                        />
                      );
                    }
                    return (
                        <ImageMarker
                          key={img.id}
                          img={img}
                          map={mapRef.current!}
                          mapViewportTick={mapViewportTick}
                          isSelected={selectedImageId === img.id}
                          isDragging={draggingImage?.id === img.id}
                          animationTick={animationTick}
                        previewImageCache={previewImageCache}
                        onInteractionStart={handleInteractionStart}
                        onAddPhotoToMemory={handleAddPhotoToMemory}
                        onHoverChange={setHoveredImageId}
                        zoomScale={markerZoomScale}
                      />
                    );
                  });
                })()}
            </div>
        )}

        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*"/>
        <input type="file" ref={importInputRef} onChange={handleImportFileChange} className="hidden" accept=".pixmap" />

        {!mapExplored && images.length === 0 && !placementInfo && !isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none p-6 z-20 max-w-lg mx-auto w-full gap-3">
            <Shuffle
              tag="p"
              text="Build your echo map"
              className="m-0 text-[clamp(1rem,2.8vw,1.25rem)] md:text-xl font-semibold tracking-wide text-neutral-600"
              style={{ fontFamily: '"Roboto Mono", ui-monospace, monospace', fontWeight: 600 }}
              textAlign="center"
              shuffleDirection="right"
              duration={(0.35 / 0.64) / 0.75}
              animationMode="random"
              maxDelay={0}
              shuffleTimes={1}
              ease="power3.out"
              stagger={0.0375 / 0.75}
              threshold={0.1}
              triggerOnce={true}
              triggerOnHover={false}
              respectReducedMotion={true}
            />
            <Shuffle
              tag="p"
              text="Drag & drop, paste, or use the upload button."
              className="m-0 text-xs md:text-sm text-neutral-500 leading-relaxed"
              style={{ fontFamily: '"Roboto Mono", ui-monospace, monospace', fontWeight: 500 }}
              textAlign="center"
              shuffleDirection="right"
              duration={(0.35 / 0.64) / 0.75}
              animationMode="random"
              maxDelay={0}
              shuffleTimes={1}
              ease="power3.out"
              stagger={0.0375 / 0.75}
              threshold={0.1}
              triggerOnce={true}
              triggerOnHover={false}
              respectReducedMotion={true}
            />
          </div>
        )}
        
        {placementInfo && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[200px] bg-white p-4 border border-black shadow-lg z-40 max-w-md">
                <p>
                  {placementInfo.buildingName?.trim()
                    ? t('placementPromptWithBuilding', { name: placementInfo.buildingName.trim() })
                    : t('placementPrompt')}
                </p>
                <button onClick={() => setPlacementInfo(null)} className="absolute top-1 right-1 text-xl leading-none px-2">&times;</button>
            </div>
        )}

        {selectedImage && mapRef.current && !selectedImage.isLocked && (
             <Toolbar
                selectedImage={selectedImage}
                map={mapRef.current}
                mapViewportTick={mapViewportTick}
                onRegenerate={handleRegenerateSelected}
                onFlip={handleFlipSelected}
                onDuplicate={handleDuplicateSelected}
                onScale={handleScaleSelected}
                onDelete={handleDeleteSelected}
                onEdit={handleEditSelected}
                onLock={handleLockSelected}
             />
        )}

        {selectedImage && mapRef.current && selectedImage.isLocked && (
            <MemoryCards
                selectedImage={selectedImage}
                map={mapRef.current}
                mapViewportTick={mapViewportTick}
                onUnlock={handleUnlockSelected}
                onViewPhoto={handleViewPhoto}
                onOpenPhotoModal={handleAddPhotoClick}
                onOpenAudioModal={() => setShowMemoryAudioModal(true)}
                onEditLog={handleEditLog}
            />
        )}
       
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-20 pointer-events-none" style={{ bottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
            <div className="flex items-center justify-center gap-3 pointer-events-auto flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setMapExplored(true);
                    setShowAddBuildingModal(true);
                  }}
                  className="h-[29px] w-[29px] shrink-0 overflow-visible rounded-full border border-black bg-white flex items-center justify-center shadow-sm hover:bg-neutral-50 transition-colors"
                  style={{ borderWidth: MAP_ICON_BORDER_PX }}
                  aria-label={t('hammerAddBuilding')}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <rect x="4" y="8.6" width="16" height="10.4" rx="2" />
                      <circle cx="12" cy="13.5" r="2.2" />
                      <path d="M12 1.2v8.2" />
                      <path d="M9.8 4.3 12 2.1l2.2 2.2" />
                    </svg>
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport()}
                  className="h-[29px] w-[29px] shrink-0 overflow-visible rounded-full border border-black bg-white flex items-center justify-center shadow-sm hover:bg-neutral-50 transition-colors"
                  style={{ borderWidth: MAP_ICON_BORDER_PX }}
                  aria-label={t('exportMap')}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                </button>
            </div>
        </div>

        {showResetConfirm && (
            <ResetConfirmModal
                onConfirm={handleResetCanvas}
                onCancel={() => setShowResetConfirm(false)}
            />
        )}
        {showImportConfirm && (
            <ImportConfirmModal
                onConfirm={confirmImport}
                onCancel={() => setShowImportConfirm(false)}
            />
        )}
        </div>

        <div
          className="relative flex h-[25dvh] shrink-0 flex-col items-center justify-center bg-[#F9F1E2] px-6 py-3 z-[25]"
          style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}
          onWheel={(e) => {
            if (e.deltaY > 36) {
              e.preventDefault();
              scrollToGallery();
            }
          }}
          onTouchStart={(e) => {
            homeTransitionTouchStartYRef.current = e.touches[0]?.clientY ?? null;
          }}
          onTouchEnd={(e) => {
            const start = homeTransitionTouchStartYRef.current;
            const end = e.changedTouches[0]?.clientY ?? null;
            homeTransitionTouchStartYRef.current = null;
            if (start == null || end == null) return;
            const dy = end - start;
            if (dy > -46) return;
            scrollToGallery();
          }}
        >
          <button
            type="button"
            className="flex flex-col items-center bg-transparent border-0 cursor-pointer text-[#756F6C] transition-all duration-200 ease-in-out hover:-translate-y-0.5 text-base md:text-lg m-0 p-0"
            style={{
              fontWeight: 400,
              lineHeight: 1.45,
              letterSpacing: '0.04em',
            }}
            onClick={() =>
              scrollToGallery()
            }
          >
            <span>{t('scrollForMore')}</span>
            <svg
              className="mt-1.5 block shrink-0"
              width={36}
              height={24}
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden
            >
              <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        </section>

        <section
          id="echo-section-gallery"
          className="flex h-[100dvh] min-h-[100dvh] w-full shrink-0 snap-start flex-col overflow-hidden bg-[#F9F1E2]"
          aria-label={t('galleryTab')}
        >
            <GallerySection
              buildings={lockedGalleryBuildings}
              onSwipeToHome={scrollToHome}
              onOpenBuilding={(id) => {
                setGalleryDetailId(id);
                setGalleryOpenM03(true);
                setGalleryOpenM04(false);
              }}
            />
        </section>
        </div>
      </div>

      {import.meta.env.DEV && devEchoApiHint && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 max-w-[min(640px,calc(100vw-2rem))] bg-amber-950 text-amber-50 text-xs px-4 py-3 rounded-md shadow-lg z-[199] border border-amber-700/80 leading-snug"
          style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          role="status"
        >
          {devEchoApiHint}
        </div>
      )}

      {toastMessage && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 bg-black text-white px-4 py-2 rounded-md shadow-lg z-[200] animate-toast flex items-center gap-2 ${
            isLocateSuccessToast ? 'top-1/2 -translate-y-1/2' : 'top-4'
          }`}
          style={isLocateSuccessToast ? undefined : { top: 'max(1rem, env(safe-area-inset-top))' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          {toastMessage}
        </div>
      )}

      {isLoading && (
        <div className="fixed inset-0 bg-white/80 flex items-center justify-center z-[200]">
          <div className="flex flex-col items-center gap-4">
            <svg className="animate-spin h-8 w-8 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <p className="text-black">{isLoading.message}</p>
          </div>
        </div>
      )}

      {photoPreviewState && (
        <PhotoPreviewModal
          photos={photoPreviewState.photos}
          currentIndex={photoPreviewState.currentIndex}
          onClose={() => setPhotoPreviewState(null)}
          onNext={handlePhotoPreviewNext}
          onPrevious={handlePhotoPreviewPrevious}
          onDelete={photoPreviewState.currentIndex > 0 ? () => {
            void handleDeletePhotoFromMemory(photoPreviewState.memoryId, photoPreviewState.currentIndex);
            setPhotoPreviewState((prev) => {
              if (!prev) return null;
              if (prev.photos.length <= 1) return null;
              const nextPhotos = prev.photos.filter((_, idx) => idx !== prev.currentIndex);
              const nextIndex = Math.min(prev.currentIndex, nextPhotos.length - 1);
              return {
                ...prev,
                photos: nextPhotos,
                currentIndex: nextIndex,
              };
            });
          } : undefined}
        />
      )}

      {showLogModal && selectedImage && (
        <TravelLogModal log={selectedImage.log} onSave={handleSaveLog} onClose={() => setShowLogModal(false)} />
      )}

      <MemoryPhotoModal
        open={showMemoryPhotoModal}
        onClose={() => setShowMemoryPhotoModal(false)}
        onSave={(file) => {
          if (selectedImageId === null) return;
          void handleAddPhotoToMemory(selectedImageId, file);
          setShowMemoryPhotoModal(false);
        }}
      />

      <MemoryAudioModal
        open={showMemoryAudioModal}
        currentEntries={selectedImage?.audioEntries ?? []}
        onClose={() => setShowMemoryAudioModal(false)}
        onSave={(entries) => {
          if (selectedImageId === null) return;
          handleSaveAudioEntriesToMemory(selectedImageId, entries);
        }}
      />

      <AddBuildingModal
        open={showAddBuildingModal}
        onClose={() => setShowAddBuildingModal(false)}
        onSave={(file, buildingName, buildingStyle, stylePrompt) => {
          handleAddBuildingSave(file, buildingName, buildingStyle, stylePrompt);
        }}
      />

      {showHelpModal && <HelpModal onClose={() => setShowHelpModal(false)} />}

      <GalleryDetailModals
        key={galleryDetailId === null ? 'gallery-detail-closed' : `gallery-detail-${galleryDetailId}`}
        openM03={galleryOpenM03}
        openM04={galleryOpenM04}
        photos={galleryBuilding?.photos ?? []}
        audioEntries={galleryBuilding?.audioEntries ?? []}
        onDeletePhotos={
          galleryDetailId === null
            ? undefined
            : (photoIndexes) => {
                handleDeletePhotosFromGallery(galleryDetailId, photoIndexes);
              }
        }
        log={
          galleryBuilding?.log ??
          normalizeLog({
            location: '',
            buildingName: undefined,
            date: '',
            partner: '',
            moon: '',
            musings: '',
            avatarVariant: 0,
            landmark_id: undefined,
          })
        }
        onGoToMemories={() => {
          setGalleryOpenM04(true);
          setGalleryOpenM03(false);
        }}
        onBackToGalleryFromM03={() => {
          setGalleryOpenM03(false);
          setGalleryDetailId(null);
        }}
        onBackToDiary={() => {
          setGalleryOpenM04(false);
          setGalleryOpenM03(true);
        }}
        onBackToGalleryFromM04={() => {
          setGalleryOpenM04(false);
          setGalleryOpenM03(false);
          setGalleryDetailId(null);
        }}
      />
    </div>
  );
};

export default App;
