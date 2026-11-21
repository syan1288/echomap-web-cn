import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Tone from 'tone';
import { useAuth } from '../../context/AuthContext';
import { useLocalization } from '../../context/LocalizationContext';
import {
  EchoCameraIcon,
  EchoDownloadIcon,
  EchoGalleryIcon,
  EchoHomeIcon,
  EchoLocationPinIcon,
  EchoMapIcon,
  EchoMapStyleIcon,
  EchoMinusIcon,
  EchoPlusIcon,
  EchoSearchIcon,
  EchoSettingsIcon,
  EchoSparklesIcon,
} from '../../shared/components/icons/EchoIcons';
import { deleteBuildingFromCloud, isSupabaseConfigured, loadAllCloudBuildings } from '../../services/cloudBuildings';
import { formatCityCountry, resolveSessionAnchor } from '../../services/sessionGeo';
import { MemoryCards } from '../../components/MemoryCards';
import { Toolbar } from '../../components/Toolbar';
import { TravelLogModal } from '../../components/TravelLogModal';
import { MemoryPhotoModal } from '../../components/MemoryPhotoModal';
import { MemoryAudioModal } from '../../components/MemoryAudioModal';
import { PhotoPreviewModal } from '../../components/PhotoPreviewModal';
import { GalleryDetailModals } from '../../components/GalleryDetailModals';
import { HelpModal } from '../../components/HelpModal';
import { VersionPlanModal } from '../../components/VersionPlanModal';
import { AddBuildingModal } from '../../components/AddBuildingModal';
import { BuildingStyleEditorModal } from '../../components/BuildingStyleEditorModal';
import { MoonFaceAvatar } from '../../components/MoonFaceAvatar';
import { AuthPanel, type AuthStage } from '../../components/AuthPanel';
import { EchoSidebarBrandIllustration } from '../../components/EchoSidebarBrandIllustration';
import { SidebarNoiseCanvas } from '../../components/SidebarNoiseCanvas';
import { deploymentConfig } from '../../lib/deploymentConfig';
import {
  BASEMAP_THEME_OPTIONS,
  getPoiDotColor,
  getPoiDotSize,
  type BasemapThemeId,
  MapboxAdapter,
  createRasterFallbackStyle,
} from '../../lib/mapboxAdapter';
import { loadMapbox, prewarmMapbox } from '../../lib/mapboxLoader';
import { apiUrl } from '../../lib/apiBase';
import { scheduleDeadline } from '../../lib/cloudSyncDeadline';
import { buildPlaceSearchUrl, buildReverseGeocodeUrl } from '../../lib/deploymentConfig';
import {
  fetchImageProviderAvailability,
  type ImageProviderAvailability,
} from '../../services/imageProviderAvailability';
import { checkGenerationQuota, generateImageWithPrompt, type PreferredImageModel } from '../../services/geminiService';
import { assertFileSizeOk } from '../../shared/domain/uploads/uploadLimits';
import { buildGeocodeQueries, shouldGeocodeBuildingName } from '../../shared/domain/geo/geoFromBuildingName';
import { continentKeyFromLatLng } from '../../shared/domain/geo/geoStats';
import { parseReverseGeocodePlace, parseSearchSuggestions, type SearchSuggestion } from '../../shared/domain/geo/locationParsers';
import { DEFAULT_BUILDING_STYLE, type BuildingStyleDefinition, type BuildingStyleId } from '../../shared/domain/building-style/buildingStyle';
import { useBuildingStyles } from '../../hooks/useBuildingStyles';
import { clampGalleryPage, paginateGalleryItems } from '../../shared/domain/galleryPagination';
import type { AudioEntry, LogData, PhotoData, ProcessedImage } from '../../web/app/webMemoryTypes';
import './MobileShell.css';

type MobileTab = 'home' | 'map' | 'gallery' | 'setting';
type MobileModelId = 'jimeng' | 'gemini';
type SettingSubview = 'main' | 'account' | 'privacy' | 'styles';
type ProfileEditField = 'name' | 'phone' | 'email';
type PermissionKind = 'notifications' | 'camera' | 'photos' | 'microphone' | 'files' | 'bluetooth';
type MobileMapPlacement = { lat: number; lng: number; location?: string };
type MapPlacementNotice = { id: number; location: string };
type MapTextNotice = { id: number; text: string };
type MobileGenerationBalance = {
  currentPlan: 'free' | 'plus' | 'pro';
  quotaPlan: 'free' | 'plus' | 'pro';
  remainingGenerations: number;
};

type MobileMemory = {
  id: number;
  cloudId?: string;
  place: string;
  date: string;
  region: string;
  imageSrc: string;
  lat?: number;
  lng?: number;
  photos?: PhotoData[];
  audioEntries?: AudioEntry[];
  log?: LogData;
  deleted?: boolean;
  buildingStyle?: BuildingStyleId;
  stylePrompt?: string;
  isGenerating?: boolean;
  generationError?: string;
  defaultUnlocked?: boolean;
};

type MobileMemoryAdjustment = {
  lat?: number;
  lng?: number;
  scale?: number;
  flippedHorizontally?: boolean;
};

type DraggingMobileMemory = {
  slotKey: string;
  startX: number;
  startY: number;
  startLat: number;
  startLng: number;
};

type MobileImageProcessingResult = {
  src: string;
  contentBounds: { x: number; y: number; width: number; height: number };
};

function mobileTabPanelClass(active: boolean) {
  return `mobile-tab-panel ${active ? 'mobile-tab-panel-active' : 'mobile-tab-panel-hidden'}`;
}

const BRAND_BLUE = '#0053D4';
const SKY_BLUE = '#c6ddff';
const CREAM = '#F9F1E2';
const INK = '#111111';
const MUTED = '#5f6656';
const DISPLAY_FONT = '"Gasoek One", sans-serif';
const MONO_FONT = '"Roboto Mono", ui-monospace, monospace';
const COMFORTAA_FONT = '"Comfortaa", cursive';
const UI_FONT = '"Plus Jakarta Sans", "Roboto", system-ui, sans-serif';
const BRAND_ART = '/assets/echo-sidebar-brand.svg';
const OPERA = '/assets/map-building-opera.png';
const WALL = '/assets/map-building-stone-wall.png';
const MOBILE_MAPBOX_STYLE = 'mapbox://styles/mapbox/light-v11';
const MOBILE_BUILDING_WIDTH = 102;
const MOBILE_DOT_ZOOM_THRESHOLD = 2.05;
const MOBILE_INITIAL_BUILDING_ZOOM = MOBILE_DOT_ZOOM_THRESHOLD + 0.08;
const MOBILE_BUILDING_MIN_ZOOM_SCALE = 0.76;
const MOBILE_BUILDING_MAX_ZOOM_SCALE = 2.25;
const MOBILE_BUILDING_ZOOM_EASING = 0.82;
const COLOR_DISTANCE_THRESHOLD = 32;
const FALLBACK_MOONS = ['🌙', '🌉', '🌧️', '🏛️', '🌊', '🧱', '✨', '📍'];
const PLACE_LABELS: Record<string, { en: string; zh: string }> = {
  南京新街口: { en: 'Nanjing Xinjiekou', zh: '南京新街口' },
  深圳深中通道: { en: 'Shenzhen-Zhongshan Link', zh: '深圳深中通道' },
  南京雨花台: { en: 'Nanjing Yuhuatai', zh: '南京雨花台' },
  重庆大会堂: { en: 'Chongqing Great Hall', zh: '重庆大会堂' },
  'Sydney Opera House': { en: 'Sydney Opera House', zh: 'Sydney Opera House' },
  'Nanjing Yuhuatai': { en: 'Nanjing Yuhuatai', zh: '南京雨花台' },
};

const MOBILE_MODEL_OPTIONS: Array<{ id: MobileModelId; label: string }> = [
  { id: 'jimeng', label: 'Updream' },
  { id: 'gemini', label: 'Gemini' },
];
const MOBILE_MODEL_STORAGE_KEY = 'echomap-mobile-image-model';
const MOBILE_MEMORIES_STORAGE_KEY = 'echomap-mobile-memories-v1';
const MOBILE_DELETED_MEMORIES_STORAGE_KEY = 'echomap-mobile-deleted-memories-v1';

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mapBuildingZoomScale(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= MOBILE_DOT_ZOOM_THRESHOLD) return 1;
  return clampNumber(
    Math.pow(2, (zoom - MOBILE_INITIAL_BUILDING_ZOOM) * MOBILE_BUILDING_ZOOM_EASING),
    MOBILE_BUILDING_MIN_ZOOM_SCALE,
    MOBILE_BUILDING_MAX_ZOOM_SCALE,
  );
}

function isMobileModelId(value: string | null | undefined): value is MobileModelId {
  return value === 'jimeng' || value === 'gemini';
}

function readStoredMobileModel(): MobileModelId {
  if (typeof window === 'undefined') return 'gemini';
  const stored = window.localStorage.getItem(MOBILE_MODEL_STORAGE_KEY);
  return isMobileModelId(stored) ? stored : 'gemini';
}

function preferredImageModelFromMobileModel(model: MobileModelId): PreferredImageModel {
  return model;
}

const mobileSynth = new Tone.Synth({
  oscillator: { type: 'sine' },
  envelope: {
    attack: 0.01,
    decay: 0.2,
    sustain: 0,
    release: 0.2,
  },
}).toDestination();

const ensureMobileAudioContext = async () => {
  if (Tone.context.state !== 'running') {
    await Tone.start();
  }
};

const MOBILE_COPY = {
  en: {
    brandSubtitle: <>Stories and photos of long walks,<br />wrong turns,<br />and everyday discoveries.</>,
    authLoading: 'Checking session…',
    signIn: 'Sign in',
    createAccount: 'Create account',
    back: 'Back',
    edit: 'Edit',
    email: 'Email',
    phone: 'Phone',
    password: 'Password',
    enterEchoMap: 'Enter Echo Map',
    forgetPassword: 'Forget password',
    checkEmail: 'Check your email to confirm',
    supabaseMissing: 'Supabase is not configured',
    home: 'Home',
    map: 'Map',
    gallery: 'Gallery',
    setting: 'Settings',
    primaryNavigation: 'Primary navigation',
    city: 'CITY',
    country: 'COUNTRY',
    continent: 'CONTINENT',
    loadingMap: 'Loading map...',
    mapboxLoadFailed: 'Mapbox failed to load',
    mapboxTokenMissing: 'Mapbox token missing',
    cloudSyncSlow: 'Cloud sync is taking longer. Local data is available while it continues.',
    cloudSyncFailed: 'Cloud sync failed. Showing saved data available on this device.',
    cloudEmpty: 'No saved memories were found in your cloud account.',
    typeLocationFirst: 'Type a location first',
    noMatchingMemory: 'No matching memory',
    currentLocation: 'Current location',
    mapStyle: 'Map style',
    camera: 'Camera',
    download: 'Download',
    selectBuildingFirst: 'Select a building first',
    downloadStarted: 'Download started',
    locationFound: 'Location found! Placing your memory in',
    saved: 'Saved',
    generationFailed: 'Generation failed',
    audioSaved: 'Audio saved',
    searchLocation: 'Search location……',
    filterBy: 'Filter by…',
    applyFilter: 'Apply filter',
    noMatchingMemories: 'Waiting for more',
    prev: '< prev',
    next: 'Next>',
    trackActivities: 'Track your travel activities',
    less: 'Less',
    more: 'More',
    inCity: 'In',
    settings: 'Settings',
    closeSettings: 'Close settings',
    collapseSettings: 'Collapse settings',
    backToSettings: 'Back to settings',
    account: 'Account',
    accountSettings: 'Account settings',
    editProfile: 'Edit Profile',
    privacyTitle: 'Privacy & Permissions',
    name: 'Name',
    goSet: 'Settings',
    changeAvatar: 'Change avatar',
    editName: 'Edit name',
    editPhone: 'Edit phone',
    editEmail: 'Edit email',
    language: 'Language',
    model: 'Model',
    chooseModel: 'Choose model',
    providerNotConfigured: 'Not configured',
    imageProviderNotConfigured: 'This image provider is not configured. Choose an available provider in Settings.',
    controls: 'Controls',
    versionPlan: 'Balance',
    permissionPrivacy: 'Permission & Privacy',
    permissionPrivacyLabel: 'Permission and privacy',
    logout: 'Logout',
    notifications: 'Notifications',
    photos: 'Photos',
    microphone: 'Microphone',
    files: 'Files',
    bluetooth: 'Bluetooth',
    paper: 'Paper',
    mist: 'Mist',
    grey: 'Grey',
    clove: 'Clove',
    styleSuffix: 'style',
    permissionGranted: 'Permission connected',
    permissionUnsupported: 'This permission is not available here',
    permissionPickPhoto: 'Photo picker opened',
    permissionPickFile: 'File picker opened',
    permissionDenied: 'Permission was not granted',
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  },
  zh: {
    brandSubtitle: <>长途散步、<br />转错弯、<br />日常发现的故事和照片。</>,
    authLoading: '正在检查登录状态…',
    signIn: '登录',
    createAccount: '创建账号',
    back: '返回',
    edit: '编辑',
    email: '邮箱',
    phone: '手机',
    password: '密码',
    enterEchoMap: '进入 Echo Map',
    forgetPassword: '忘记密码',
    checkEmail: '请查收邮件确认',
    supabaseMissing: '未配置 Supabase',
    home: '首页',
    map: '地图',
    gallery: '相册',
    setting: '设置',
    primaryNavigation: '主导航',
    city: '城市',
    country: '国家',
    continent: '洲',
    loadingMap: '地图加载中...',
    mapboxLoadFailed: 'Mapbox 加载失败',
    mapboxTokenMissing: '缺少 Mapbox token',
    cloudSyncSlow: '云端同步耗时较长，可先继续使用本地内容。',
    cloudSyncFailed: '云端同步失败，当前仅显示此设备已保存的内容。',
    cloudEmpty: '云端账号中暂时没有已保存的记忆。',
    typeLocationFirst: '请先输入地点',
    noMatchingMemory: '没有匹配的回忆',
    currentLocation: '当前位置',
    mapStyle: '地图样式',
    camera: '相机',
    download: '下载',
    selectBuildingFirst: '请先选择建筑',
    downloadStarted: '已开始下载',
    locationFound: '已定位，将你的回忆放在',
    saved: '已保存',
    generationFailed: '生成失败',
    audioSaved: '录音已保存',
    searchLocation: '搜索地点……',
    filterBy: '筛选…',
    applyFilter: '应用筛选',
    noMatchingMemories: '没有匹配的回忆',
    prev: '< 上一页',
    next: '下一页>',
    trackActivities: '记录你的旅行活动',
    less: '少',
    more: '多',
    inCity: '在',
    settings: '设置',
    closeSettings: '关闭设置',
    collapseSettings: '收起设置',
    backToSettings: '返回设置',
    account: '账号',
    accountSettings: '账号设置',
    editProfile: '编辑资料',
    privacyTitle: '隐私与权限',
    name: '名称',
    goSet: '去设置',
    changeAvatar: '更换头像',
    editName: '编辑名称',
    editPhone: '编辑手机号',
    editEmail: '编辑邮箱',
    language: '语言',
    model: '模型',
    chooseModel: '选择模型',
    providerNotConfigured: '未配置',
    imageProviderNotConfigured: '当前生图渠道尚未配置，请在设置中选择可用渠道。',
    controls: '操作',
    versionPlan: '余额',
    permissionPrivacy: '权限与隐私',
    permissionPrivacyLabel: '权限与隐私',
    logout: '退出登录',
    notifications: '通知',
    photos: '相册权限',
    microphone: '麦克风',
    files: '文件访问',
    bluetooth: '蓝牙',
    paper: '纸张',
    mist: '薄雾',
    grey: '灰色',
    clove: '丁香',
    styleSuffix: '样式',
    permissionGranted: '权限已接通',
    permissionUnsupported: '当前环境不支持该权限',
    permissionPickPhoto: '已打开相册选择器',
    permissionPickFile: '已打开文件选择器',
    permissionDenied: '未获得权限',
    months: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
  },
} as const;

function useMobileCopy() {
  const { language } = useLocalization();
  return MOBILE_COPY[language];
}

function mobileMemorySlotKey(memory: MobileMemory, index: number): string {
  return `${memory.id}-${index}`;
}

const JimengBrandIcon: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <defs>
      <linearGradient id="mobileJimengGradient" x1="4" y1="3.5" x2="20" y2="20.5" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#23A7FF" />
        <stop offset="55%" stopColor="#55D3FF" />
        <stop offset="100%" stopColor="#1A5CFF" />
      </linearGradient>
    </defs>
    <path d="M12 2.2c1.2 3.4 3.2 5.4 6.6 6.6-3.4 1.2-5.4 3.2-6.6 8.8-1.2-5.6-3.2-7.6-6.6-8.8 3.4-1.2 5.4-3.2 6.6-6.6Z" fill="url(#mobileJimengGradient)" />
  </svg>
);

const GeminiBrandIcon: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <defs>
      <linearGradient id="mobileGeminiGradient" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#1A73E8" />
        <stop offset="30%" stopColor="#34A853" />
        <stop offset="60%" stopColor="#FBBC04" />
        <stop offset="100%" stopColor="#EA4335" />
      </linearGradient>
    </defs>
    <path d="M12 1.8c1.6 4.9 4.4 7.7 9.2 9.2-4.8 1.5-7.6 4.3-9.2 11.2-1.6-6.9-4.4-9.7-9.2-11.2 4.8-1.5 7.6-4.3 9.2-9.2Z" fill="url(#mobileGeminiGradient)" />
  </svg>
);

const OpenAIBrandIcon: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ color: INK }} aria-hidden>
    <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729Zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .0386.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944Zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464ZM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956Zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.7664.7664 0 0 0-.407-.667Zm2.0107-3.0231-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.679Zm-12.6413 4.1347-2.02-1.1638a.0804.0804 0 0 1-.0387-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805-4.7783 2.7582a.7948.7948 0 0 0-.3927.6813l-.004 6.7225Zm1.0976-2.3654 2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
  </svg>
);

const MobileModelIcon: React.FC<{ model: MobileModelId; size?: number }> = ({ model, size = 24 }) => {
  if (model === 'gemini') return <GeminiBrandIcon size={size} />;
  return <JimengBrandIcon size={size} />;
};

const IconLogout: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M10 6H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4" />
    <path d="M13 8l5 4-5 4" />
    <path d="M18 12H9" />
  </svg>
);

const IconChevronDown: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const IconChevronRight: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

const IconClose: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

const IconAccount: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="8" r="3.2" />
    <path d="M5.5 20c.7-3.7 2.9-5.6 6.5-5.6s5.8 1.9 6.5 5.6" />
  </svg>
);

const IconCameraOnly: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M8.4 7.3 9.8 5.6h4.4l1.4 1.7H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.3a2 2 0 0 1 2-2h3.4Z" />
    <circle cx="12" cy="13.5" r="3.1" />
    <circle cx="18" cy="10.2" r="0.45" fill="currentColor" stroke="none" />
  </svg>
);

const IconLanguage: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 5h8" />
    <path d="M8 3v2" />
    <path d="M6 5c.5 2.8 2.3 5 5 6.6" />
    <path d="M11 5c-.8 3.2-2.9 5.8-6.2 7.7" />
    <path d="M14 20l3.6-9 3.6 9" />
    <path d="M15.3 16.8h4.6" />
  </svg>
);

const IconShield: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3.5 19 6v5.5c0 4.3-2.4 7.2-7 9-4.6-1.8-7-4.7-7-9V6l7-2.5Z" />
    <path d="m9 12 2 2 4-5" />
  </svg>
);

const IconVersionPlan: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="4.2" y="5" width="15.6" height="14" rx="2" />
    <path d="M7.5 9h9" />
    <path d="M7.5 12h4.8" />
    <path d="M8.2 16.1h2.6M13.2 16.1h2.6" />
  </svg>
);

const IconBell: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6.8 10.5c0-3.4 2.1-5.7 5.2-5.7s5.2 2.3 5.2 5.7v3.2l1.5 2.4H5.3l1.5-2.4Z" />
    <path d="M10 18.6c.4.8 1.1 1.2 2 1.2s1.6-.4 2-1.2" />
  </svg>
);

const IconImage: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.5" />
    <path d="m6.8 17 4.3-4.2 2.8 2.8 2-2 3.3 3.4" />
  </svg>
);

const IconMic: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="9" y="3.5" width="6" height="10" rx="3" />
    <path d="M5.5 11.5c0 3.6 2.6 6.1 6.5 6.1s6.5-2.5 6.5-6.1" />
    <path d="M12 17.6v3" />
  </svg>
);

const IconFileDoc: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 3.8h7l3 3v13.4H7Z" />
    <path d="M14 3.8v3h3" />
    <path d="M9.4 11h5.2M9.4 14.2h5.2M9.4 17.4h3.5" />
  </svg>
);

const IconBluetooth: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3.5v17l5-4.4-5-4.1 5-4.1Z" />
    <path d="m7 8.2 10 7.6M7 15.8 17 8.2" />
  </svg>
);

const seedMemories: MobileMemory[] = [
  { id: 1, place: 'Sydney Opera House', date: '2026.05.02', region: 'Sydney, Australia', imageSrc: OPERA, lat: -33.8568, lng: 151.2153 },
  { id: 2, place: 'Nanjing Yuhuatai', date: '2026.04.18', region: 'Nanjing, China', imageSrc: WALL, lat: 32.004, lng: 118.776 },
  { id: 3, place: 'Sydney Opera House', date: '2026.03.28', region: 'Sydney, Australia', imageSrc: OPERA, lat: -33.8568, lng: 151.2153 },
  { id: 4, place: 'Nanjing Yuhuatai', date: '2026.02.20', region: 'Nanjing, China', imageSrc: WALL, lat: 32.004, lng: 118.776 },
  { id: 5, place: 'Sydney Opera House', date: '2026.01.12', region: 'Sydney, Australia', imageSrc: OPERA, lat: -33.8568, lng: 151.2153 },
  { id: 6, place: 'Nanjing Yuhuatai', date: '2025.12.08', region: 'Nanjing, China', imageSrc: WALL, lat: 32.004, lng: 118.776 },
];
const seedMemoryIds = new Set(seedMemories.map((memory) => memory.id));

type StoredMobilePhoto = {
  url?: string;
  photo_id?: string;
  createdAt?: string;
  name?: string;
  type?: string;
};

type StoredMobileMemory = Omit<MobileMemory, 'photos' | 'audioEntries'> & {
  photos?: StoredMobilePhoto[];
};

function mobileMemoryDeleteKeys(memory: Pick<MobileMemory, 'id' | 'cloudId'>): string[] {
  return [
    memory.cloudId ? `cloud:${memory.cloudId}` : null,
    `local:${memory.id}`,
  ].filter((key): key is string => Boolean(key));
}

function readDeletedMobileMemoryKeys(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(MOBILE_DELETED_MEMORIES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === 'string') : []);
  } catch (error) {
    console.warn('Failed to read deleted mobile memories', error);
    return new Set();
  }
}

function writeDeletedMobileMemoryKeys(keys: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    if (keys.size) {
      window.localStorage.setItem(MOBILE_DELETED_MEMORIES_STORAGE_KEY, JSON.stringify([...keys]));
    } else {
      window.localStorage.removeItem(MOBILE_DELETED_MEMORIES_STORAGE_KEY);
    }
  } catch (error) {
    console.warn('Failed to store deleted mobile memories', error);
  }
}

function rememberDeletedMobileMemory(memory: Pick<MobileMemory, 'id' | 'cloudId'>) {
  const keys = readDeletedMobileMemoryKeys();
  mobileMemoryDeleteKeys(memory).forEach((key) => keys.add(key));
  writeDeletedMobileMemoryKeys(keys);
}

function isMobileMemoryDeletedByStorage(memory: Pick<MobileMemory, 'id' | 'cloudId'>, deletedKeys: Set<string>) {
  return mobileMemoryDeleteKeys(memory).some((key) => deletedKeys.has(key));
}

function isPersistableMobileImage(src: string | undefined): src is string {
  return Boolean(src && !src.startsWith('blob:'));
}

function storedPhotoToMobilePhoto(photo: StoredMobilePhoto, index: number, memoryId: number): PhotoData | null {
  if (!isPersistableMobileImage(photo.url)) return null;
  const name = photo.name || `stored-photo-${memoryId}-${index}.jpg`;
  const file = new File([], name, { type: photo.type || 'image/jpeg' });
  return {
    file,
    url: photo.url,
    photo_id: photo.photo_id ?? `${photoIdFor(memoryId)}-stored-${index}`,
    createdAt: photo.createdAt,
  };
}

function storedMemoryToMobileMemory(memory: StoredMobileMemory): MobileMemory | null {
  if (!isPersistableMobileImage(memory.imageSrc)) return null;
  return {
    ...memory,
    imageSrc: memory.imageSrc,
    photos: memory.photos?.map((photo, index) => storedPhotoToMobilePhoto(photo, index, memory.id)).filter((item): item is PhotoData => Boolean(item)),
    audioEntries: [],
    isGenerating: false,
  };
}

function mobileMemoryToStoredMemory(memory: MobileMemory): StoredMobileMemory | null {
  if (seedMemoryIds.has(memory.id) || memory.deleted || memory.isGenerating || !isPersistableMobileImage(memory.imageSrc)) {
    return null;
  }
  return {
    id: memory.id,
    cloudId: memory.cloudId,
    place: memory.place,
    date: memory.date,
    region: memory.region,
    imageSrc: memory.imageSrc,
    lat: memory.lat,
    lng: memory.lng,
    log: memory.log,
    deleted: false,
    buildingStyle: memory.buildingStyle,
    isGenerating: false,
    defaultUnlocked: memory.defaultUnlocked,
    photos: memory.photos
      ?.filter((photo) => isPersistableMobileImage(photo.url))
      .map((photo) => ({
        url: photo.url,
        photo_id: photo.photo_id,
        createdAt: photo.createdAt,
        name: photo.file?.name,
        type: photo.file?.type,
      })),
  };
}

function mobileGenerationErrorMessage(error: unknown, fallback: string, language: 'en' | 'zh'): string {
  const raw =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : typeof error === 'string' && error.trim()
        ? error.trim()
        : '';
  if (/免费(?:生成)?额度|Free (?:generation )?quota|GENERATION_QUOTA_EXHAUSTED/i.test(raw)) {
    return language === 'zh'
      ? '免费额度已用完，请购买额度解锁。'
      : 'Free quota is used up. Please buy credits to unlock.';
  }
  if (/请先登录|Login required|AUTH_REQUIRED/i.test(raw)) {
    return language === 'zh'
      ? '请先登录后再生成 3D 建筑。'
      : 'Please sign in before generating a 3D building.';
  }
  const requestId = raw.match(/request\s*id["':\s]+([a-f0-9-]{12,})/i)?.[1];
  if (requestId && language === 'zh') return `生图失败，诊断编号：${requestId}`;
  if (/JIMENG_(?:ACCESS_KEY_ID|SECRET_ACCESS_KEY).*missing|OPENAI_API_KEY.*missing|Gemini API key.*missing|not configured/i.test(raw)) {
    return MOBILE_COPY[language].imageProviderNotConfigured;
  }
  if (raw && language === 'en') return raw;
  return fallback;
}

function readStoredMobileMemories(): MobileMemory[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(MOBILE_MEMORIES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredMobileMemory[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(storedMemoryToMobileMemory)
      .filter((memory): memory is MobileMemory => Boolean(memory));
  } catch (error) {
    console.warn('Failed to read stored mobile memories', error);
    return [];
  }
}

function mergeMobileMemories(...groups: MobileMemory[][]): MobileMemory[] {
  const deletedKeys = readDeletedMobileMemoryKeys();
  const seen = new Set<string>();
  const merged: MobileMemory[] = [];
  groups.flat().forEach((memory) => {
    if (memory.deleted || isMobileMemoryDeletedByStorage(memory, deletedKeys)) return;
    const key = memory.cloudId ? `cloud:${memory.cloudId}` : `local:${memory.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(memory);
  });
  return merged;
}

function restoredMobileMemoriesWithSeeds(): MobileMemory[] {
  const storedMemories = mergeMobileMemories(readStoredMobileMemories());
  return storedMemories.length ? storedMemories : seedMemories;
}

function moonForMemory(memory: MobileMemory, index: number): string {
  return memory.log?.moon?.trim() || FALLBACK_MOONS[index % FALLBACK_MOONS.length] || '🌙';
}

function getMobileDisplayMemories(memories: MobileMemory[]) {
  return memories.filter((memory) => !memory.deleted);
}

function getActiveMobileMemories(memories: MobileMemory[]) {
  return getMobileDisplayMemories(memories);
}

function fallbackImageForMemory(memory: MobileMemory): string {
  const label = `${memory.place} ${memory.region}`.toLowerCase();
  if (/opera|sydney|悉尼/.test(label)) return OPERA;
  if (/yuhuatai|雨花台|wall/.test(label)) return WALL;
  return memory.id % 2 === 0 ? WALL : OPERA;
}

function formatMobileInitials(identifier: string) {
  const raw = identifier.trim();
  if (!raw) return 'SY';

  const source = raw.includes('@') ? raw.split('@')[0] : raw;
  const digits = source.replace(/\D/g, '');
  if (!raw.includes('@') && digits.length >= 2 && /^[+\d\s().-]+$/.test(source)) {
    return digits.slice(0, 2);
  }

  const tokens = source.split(/[.\s_-]+/).filter(Boolean);
  const firstLetter = tokens[0]?.match(/[A-Za-z\u4e00-\u9fff]/)?.[0] ?? '';
  if (tokens.length >= 2) {
    const second = tokens[1] ?? '';
    const secondLetter = second.match(/[A-Za-z\u4e00-\u9fff]/)?.[0] ?? '';
    if (firstLetter && /^[A-Za-z\u4e00-\u9fff]+$/.test(second) && secondLetter) {
      return `${firstLetter}${secondLetter}`.toUpperCase();
    }
    if (firstLetter) return firstLetter.toUpperCase();
  }

  const letters = source.match(/[A-Za-z\u4e00-\u9fff]/g) ?? [];
  if (letters.length > 0) {
    return letters.slice(0, Math.min(2, letters.length)).join('').toUpperCase();
  }

  return digits.slice(0, 2) || 'SY';
}

function defaultAccountName(identifier: string): string {
  const seed = identifier || 'local-user';
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 10000000000;
  }
  return `User${String(hash).padStart(10, '0')}`;
}

function displayPlaceName(place: string, language: 'en' | 'zh'): string {
  const trimmed = place.trim();
  return PLACE_LABELS[trimmed]?.[language] ?? trimmed;
}

function displayCityName(city: string, language: 'en' | 'zh'): string {
  const trimmed = city.trim();
  const labels: Record<string, { en: string; zh: string }> = {
    Nanjing: { en: 'Nanjing', zh: '南京' },
    Sydney: { en: 'Sydney', zh: '悉尼' },
    Shenzhen: { en: 'Shenzhen', zh: '深圳' },
    Chongqing: { en: 'Chongqing', zh: '重庆' },
    Cloud: { en: 'Cloud', zh: '云端' },
  };
  return labels[trimmed]?.[language] ?? displayPlaceName(trimmed, language);
}

function formatMapMemoryStatus(memory: MobileMemory, language: 'en' | 'zh'): { lat: string; lng: string; city: string } | null {
  if (typeof memory.lat !== 'number' || typeof memory.lng !== 'number') return null;
  const ns = memory.lat >= 0 ? 'N' : 'S';
  const ew = memory.lng >= 0 ? 'E' : 'W';
  const city = memory.region.split(',')[0]?.trim() || memory.place;
  return {
    lat: `${Math.abs(memory.lat).toFixed(4)} ${ns}°`,
    lng: `${Math.abs(memory.lng).toFixed(4)} ${ew}°`,
    city: `${MOBILE_COPY[language].inCity} ${displayCityName(city, language)}`,
  };
}

function maskPhoneNumber(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7) return trimmed;
  const masked = `${digits.slice(0, 3)}${'*'.repeat(Math.max(4, digits.length - 5))}${digits.slice(-2)}`;
  return trimmed.startsWith('+') ? `+${masked}` : masked;
}

function metadataString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function rankMobileMemory(memory: MobileMemory, rawQuery: string): number | null {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return 0;

  const continent = typeof memory.lat === 'number' && typeof memory.lng === 'number'
    ? continentKeyFromLatLng(memory.lat, memory.lng)
    : '';
  const fields = [
    { value: memory.place, score: 0 },
    { value: memory.log?.buildingName, score: 4 },
    { value: memory.region, score: 18 },
    { value: memory.log?.location, score: 20 },
    { value: memory.date, score: 30 },
    { value: continent, score: 36 },
    { value: memory.log?.moon, score: 44 },
    { value: memory.log?.partner, score: 46 },
  ];

  const ranks = fields
    .map(({ value, score }) => {
      const text = (value ?? '').toLowerCase();
      const index = text.indexOf(query);
      return index >= 0 ? score + index : null;
    })
    .filter((rank): rank is number => rank !== null);

  return ranks.length ? Math.min(...ranks) : null;
}

function filterMobileMemories(memories: MobileMemory[], query: string): MobileMemory[] {
  const trimmed = query.trim();
  if (!trimmed) return memories;

  return memories
    .map((memory) => ({ memory, rank: rankMobileMemory(memory, trimmed) }))
    .filter((item): item is { memory: MobileMemory; rank: number } => item.rank !== null)
    .sort((a, b) => a.rank - b.rank)
    .map((item) => item.memory);
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function isoDateKey(): string {
  return new Date().toISOString().split('T')[0];
}

function photoIdFor(memoryId: number): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `mobile-photo-${memoryId}`;
}

function latestMobilePhoto(photos?: PhotoData[]): PhotoData | null {
  if (!photos?.length) return null;
  return [...photos]
    .map((photo, index) => {
      const createdTime = photo.createdAt ? new Date(photo.createdAt).getTime() : NaN;
      const modifiedTime = typeof photo.file?.lastModified === 'number' ? photo.file.lastModified : NaN;
      return {
        photo,
        index,
        sortTime: Number.isFinite(createdTime)
          ? createdTime
          : Number.isFinite(modifiedTime)
            ? modifiedTime
            : index,
      };
    })
    .sort((a, b) => {
      if (b.sortTime !== a.sortTime) return b.sortTime - a.sortTime;
      return b.index - a.index;
    })[0]?.photo ?? null;
}

function getMobileExifData(file: File): Promise<{ lat: number; lng: number; date: string } | null> {
  return new Promise((resolve) => {
    const exif = (globalThis as typeof globalThis & { EXIF?: any }).EXIF;
    if (!exif?.getData) {
      resolve(null);
      return;
    }
    exif.getData(file, function readMobileExif(this: any) {
      try {
        const lat = exif.getTag(this, 'GPSLatitude');
        const lng = exif.getTag(this, 'GPSLongitude');
        const latRef = exif.getTag(this, 'GPSLatitudeRef');
        const lngRef = exif.getTag(this, 'GPSLongitudeRef');
        let dateStr: string | null = exif.getTag(this, 'DateTimeOriginal');
        if (dateStr) {
          const parts = dateStr.split(' ')[0].split(':');
          dateStr = `${parts[0]}-${parts[1]}-${parts[2]}`;
        } else {
          dateStr = isoDateKey();
        }
        if (!lat || !lng || !latRef || !lngRef) {
          resolve(null);
          return;
        }
        const dmsToDd = (dms: number[], ref: 'N' | 'S' | 'E' | 'W') => {
          const dd = dms[0] + dms[1] / 60 + dms[2] / 3600;
          return ref === 'S' || ref === 'W' ? -dd : dd;
        };
        resolve({ lat: dmsToDd(lat, latRef), lng: dmsToDd(lng, lngRef), date: dateStr });
      } catch (error) {
        console.error('Mobile EXIF read failed', error);
        resolve(null);
      }
    });
  });
}

async function reverseGeocodeMobile(lat: number, lng: number, language: 'en' | 'zh'): Promise<string> {
  try {
    const response = await fetch(buildReverseGeocodeUrl(lat, lng, language, 18));
    if (!response.ok) return '';
    return parseReverseGeocodePlace(await response.json()) || '';
  } catch (error) {
    console.error('Mobile reverse geocode failed', error);
    return '';
  }
}

async function resolveMobileMapPlacementLocation(
  lat: number,
  lng: number,
  language: 'en' | 'zh',
  fallbackLocation = '',
): Promise<string> {
  const langTag = language === 'zh' ? 'zh-CN' : 'en';
  const formatted = await formatCityCountry(lat, lng, langTag);
  return formatted || await reverseGeocodeMobile(lat, lng, language) || fallbackLocation;
}

async function resolveMobileBuildingPlacement(
  file: File,
  buildingName: string,
  language: 'en' | 'zh',
  fallbackPlacement: MobileMapPlacement | null,
): Promise<{ lat: number; lng: number; location: string; date: string }> {
  const exif = await getMobileExifData(file);
  if (exif) {
    const langTag = language === 'zh' ? 'zh-CN' : 'en';
    const formatted = await formatCityCountry(exif.lat, exif.lng, langTag);
    const reversed = formatted || await reverseGeocodeMobile(exif.lat, exif.lng, language);
    return {
      lat: exif.lat,
      lng: exif.lng,
      location: reversed || fallbackPlacement?.location || buildingName || 'A wonderful location',
      date: exif.date,
    };
  }

  const name = buildingName.trim();
  if (shouldGeocodeBuildingName(name)) {
    const queries = buildGeocodeQueries(name);
    for (const query of queries) {
      try {
        const geoRes = await fetch(apiUrl('/api/geocode'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, centerFromBbox: false }),
        });
        const geo = (await geoRes.json().catch(() => ({}))) as {
          found?: boolean;
          lat?: number;
          lng?: number;
          display_name?: string;
        };
        if (geo.found && typeof geo.lat === 'number' && typeof geo.lng === 'number') {
          const langTag = language === 'zh' ? 'zh-CN' : 'en';
          const formatted = await formatCityCountry(geo.lat, geo.lng, langTag);
          return {
            lat: geo.lat,
            lng: geo.lng,
            location: formatted || geo.display_name || name,
            date: isoDateKey(),
          };
        }
      } catch (error) {
        console.error('Mobile geocode building name failed', error);
      }
    }
  }

  if (fallbackPlacement) {
    const langTag = language === 'zh' ? 'zh-CN' : 'en';
    const formatted = await formatCityCountry(fallbackPlacement.lat, fallbackPlacement.lng, langTag);
    const reversed = formatted || fallbackPlacement.location || await reverseGeocodeMobile(fallbackPlacement.lat, fallbackPlacement.lng, language);
    return {
      lat: fallbackPlacement.lat,
      lng: fallbackPlacement.lng,
      location: reversed || name || 'Map center',
      date: isoDateKey(),
    };
  }

  const anchor = await resolveSessionAnchor();
  const langTag = language === 'zh' ? 'zh-CN' : 'en';
  const formatted = await formatCityCountry(anchor.lat, anchor.lng, langTag);
  return {
    lat: anchor.lat,
    lng: anchor.lng,
    location: formatted || name || 'Current location',
    date: isoDateKey(),
  };
}

function processMobileImageForTransparency(imageUrl: string): Promise<MobileImageProcessingResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        reject(new Error('Could not get 2d context'));
        return;
      }
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
        let minX = canvas.width;
        let minY = canvas.height;
        let maxX = -1;
        let maxY = -1;
        for (let x = 0; x < canvas.width; x += 1) {
          pushIfMatch(x, 0);
          pushIfMatch(x, canvas.height - 1);
        }
        for (let y = 0; y < canvas.height; y += 1) {
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
        for (let index = 0; index < data.length; index += 4) {
          if (data[index + 3] === 0) continue;
          if (nearWhite(data[index], data[index + 1], data[index + 2])) {
            data[index + 3] = 0;
          }
        }
        for (let y = 0; y < canvas.height; y += 1) {
          for (let x = 0; x < canvas.width; x += 1) {
            if (data[(y * canvas.width + x) * 4 + 3] <= 0) continue;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
        ctx.putImageData(imageData, 0, 0);
        if (maxX >= minX && maxY >= minY) {
          const contentWidth = maxX - minX + 1;
          const contentHeight = maxY - minY + 1;
          const padding = Math.max(8, Math.round(Math.max(contentWidth, contentHeight) * 0.045));
          const sx = Math.max(0, minX - padding);
          const sy = Math.max(0, minY - padding);
          const sw = Math.min(canvas.width - sx, contentWidth + padding * 2);
          const sh = Math.min(canvas.height - sy, contentHeight + padding * 2);
          const outputCanvas = document.createElement('canvas');
          outputCanvas.width = sw;
          outputCanvas.height = sh;
          const outputCtx = outputCanvas.getContext('2d');
          if (!outputCtx) {
            throw new Error('Could not get output canvas context');
          }
          outputCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
          resolve({
            src: outputCanvas.toDataURL('image/png'),
            contentBounds: { x: 0, y: 0, width: sw, height: sh },
          });
          return;
        }
        resolve({
          src: canvas.toDataURL('image/png'),
          contentBounds: { x: 0, y: 0, width: canvas.width, height: canvas.height },
        });
      } catch (error) {
        console.error('Mobile image transparency processing failed', error);
        resolve({ src: imageUrl, contentBounds: { x: 0, y: 0, width: img.width, height: img.height } });
      }
    };
    img.onerror = (error) => reject(error);
    img.src = imageUrl;
  });
}

function mobileMemoryFromCloud(img: ProcessedImage): MobileMemory | null {
  const imageSrc = img.processedImage?.src || img.photos[0]?.url;
  if (!imageSrc) return null;
  return {
    id: img.id,
    cloudId: img.cloudId,
    place: img.log.buildingName || img.log.location || 'Untitled memory',
    date: img.log.date || todayKey(),
    region: img.log.location || 'Cloud',
    imageSrc,
    lat: img.lat,
    lng: img.lng,
    photos: img.photos,
    audioEntries: img.audioEntries,
    log: img.log,
    buildingStyle: img.buildingStyle,
    isGenerating: img.isGenerating,
  };
}

function logFromMemory(memory: MobileMemory): LogData {
  return {
    location: memory.region,
    buildingName: memory.place,
    date: memory.date,
    partner: '',
    moon: '',
    musings: '',
    landmark_id: memory.id,
    ...memory.log,
  };
}

function processedImageFromMemory(
  memory: MobileMemory,
  point: { x: number; y: number },
  isLocked = true,
  adjustment?: MobileMemoryAdjustment,
): ProcessedImage {
  const scale = adjustment?.scale ?? 1;
  const width = MOBILE_BUILDING_WIDTH * scale;
  const height = MOBILE_BUILDING_WIDTH * 0.75 * scale;
  return {
    id: memory.id,
    cloudId: memory.cloudId,
    processedImage: null,
    sourceText: memory.place,
    lat: adjustment?.lat ?? memory.lat ?? point.y,
    lng: adjustment?.lng ?? memory.lng ?? point.x,
    width,
    height,
    isGenerating: memory.isGenerating ?? false,
    contentBounds: { x: 0, y: 0, width, height },
    isLocked,
    flippedHorizontally: adjustment?.flippedHorizontally,
    photos: memory.photos ?? [],
    audioEntries: memory.audioEntries ?? [],
    log: logFromMemory(memory),
    buildingStyle: memory.buildingStyle ?? DEFAULT_BUILDING_STYLE,
  };
}

function GeneratingEllipsis({ className = '' }: { className?: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((current) => current + 1), 200);
    return () => window.clearInterval(id);
  }, []);
  const dotCount = (tick % 3) + 1;
  return (
    <span className={`echo-mobile-generating-ellipsis ${className}`} aria-label="Creating">
      {Array.from({ length: dotCount }).map((_, index) => (
        <span key={index} className="echo-mobile-generating-ellipsis-dot" />
      ))}
    </span>
  );
}

function BrandBlock({ compact = false, showSubtitle = true }: { compact?: boolean; showSubtitle?: boolean }) {
  const copy = useMobileCopy();
  return (
    <div className="flex flex-col items-center text-center">
      <h1
        className="mobile-brand-title m-0"
        style={{ color: BRAND_BLUE, fontFamily: DISPLAY_FONT, fontWeight: 400 }}
      >
        Echo Map
      </h1>
      {compact ? (
        <div className="mobile-brand-art mt-4 w-[82%] max-w-[360px]">
          <EchoSidebarBrandIllustration className="mobile-brand-clouds" />
        </div>
      ) : (
        <img
          src={BRAND_ART}
          alt=""
          className="mobile-brand-art mobile-brand-art-static mt-7 w-[76%] max-w-[330px] select-none"
          decoding="sync"
          loading="eager"
          draggable={false}
          style={{ aspectRatio: '180 / 146' }}
        />
      )}
      {showSubtitle && (
        <p
          className={`m-0 ${compact ? 'mt-5 max-w-[17rem] text-[16px] leading-[1.3]' : 'mt-8 max-w-[19rem] text-[20px] leading-[1.18]'} text-center font-normal`}
          style={{ color: BRAND_BLUE, fontFamily: UI_FONT, fontWeight: 400 }}
        >
          {copy.brandSubtitle}
        </p>
      )}
    </div>
  );
}

function LoginScreen() {
  const { configured, loading } = useAuth();
  const { language } = useLocalization();
  const copy = MOBILE_COPY[language];
  const [authStage, setAuthStage] = useState<AuthStage>('welcome');

  if (loading) {
    return (
      <main className="mobile-shell mobile-home-screen flex min-h-[100dvh] items-center justify-center px-7 text-center text-[#0053d4]">
        <SidebarNoiseCanvas />
        <p className="relative z-[1] m-0 text-[15px]" style={{ fontFamily: MONO_FONT }}>
          {copy.authLoading}
        </p>
      </main>
    );
  }

  if (!configured) {
    return (
      <main className="mobile-shell mobile-home-screen flex min-h-[100dvh] items-center justify-center px-7 text-center text-[#0053d4]">
        <SidebarNoiseCanvas />
        <p className="relative z-[1] m-0 max-w-[20rem] text-[15px]" style={{ fontFamily: MONO_FONT }}>
          {copy.supabaseMissing}
        </p>
      </main>
    );
  }

  return (
    <main className={`mobile-shell mobile-home-screen relative flex min-h-[100dvh] flex-col items-center overflow-y-auto px-7 pt-[max(2rem,env(safe-area-inset-top))] text-[#0053d4] ${authStage === 'welcome' ? 'pb-[max(1.5rem,env(safe-area-inset-bottom))]' : 'pb-0'}`}>
      <SidebarNoiseCanvas />
      <div className={`relative z-[1] flex min-h-[calc(100dvh-3.5rem)] w-full flex-1 flex-col items-center ${authStage === 'welcome' ? 'max-w-[520px]' : 'max-w-none'}`}>
        <div
          className={`flex w-full items-center justify-center ${authStage === 'welcome' ? 'flex-1 -translate-y-8' : 'shrink-0 pb-8 pt-8'}`}
          style={authStage === 'welcome' ? undefined : { minHeight: 'max(18rem, min(48dvh, calc(100dvh - 33rem)))' }}
        >
          <BrandBlock showSubtitle={authStage === 'welcome'} />
        </div>
        <div className={`w-full shrink-0 ${authStage === 'welcome' ? 'max-w-[360px] -translate-y-8 pb-[8dvh]' : 'flex flex-1 flex-col'}`}>
          <AuthPanel mobileLayout onStageChange={setAuthStage} />
        </div>
      </div>
    </main>
  );
}

function BottomNav({ activeTab, onChange }: { activeTab: MobileTab; onChange: (tab: MobileTab) => void }) {
  const copy = useMobileCopy();
  const tabs = useMemo(
    () => [
      { id: 'home' as const, label: copy.home, icon: <EchoHomeIcon strokeWidth={1.45} /> },
      { id: 'map' as const, label: copy.map, icon: <EchoMapIcon strokeWidth={1.45} /> },
      { id: 'gallery' as const, label: copy.gallery, icon: <EchoGalleryIcon strokeWidth={1.45} /> },
      { id: 'setting' as const, label: copy.setting, icon: <EchoSettingsIcon strokeWidth={1.45} /> },
    ],
    [copy]
  );

  return (
    <nav
      className="echo-bottom-nav fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.8rem,env(safe-area-inset-bottom))] pt-2"
      style={{ background: activeTab === 'home' ? CREAM : SKY_BLUE }}
      aria-label={copy.primaryNavigation}
    >
      <div className="grid grid-cols-4 items-start gap-0">
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              aria-label={tab.label}
              aria-current={active ? 'page' : undefined}
              className="flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-1 border-0 bg-transparent px-1 py-0 text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0758d6]"
            >
              <span className={`echo-nav-orb flex h-[38px] w-[38px] items-center justify-center rounded-full ${active ? 'echo-nav-orb-active text-[#1683ff]' : 'text-black'}`}>
                <span className="h-[23px] w-[23px]">{tab.icon}</span>
              </span>
              <span className={`whitespace-nowrap text-[10px] leading-3 ${active ? 'font-semibold text-[#0758d6]' : 'text-[#30343a]'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function HomePage({ memories }: { memories: MobileMemory[] }) {
  const copy = useMobileCopy();
  const displayMemories = useMemo(() => getMobileDisplayMemories(memories), [memories]);
  const buildingCount = displayMemories.length;
  const countryCount = 2;
  const continentCount = new Set(displayMemories.map((item) => item.region)).size;

  return (
    <section className="mobile-screen mobile-home-screen relative min-h-[100dvh] overflow-hidden px-8 pb-28 pt-[14dvh]">
      <SidebarNoiseCanvas />
      <div className="relative z-[1]">
        <BrandBlock compact />
        <div className="mt-16 grid grid-cols-3 text-center" style={{ color: BRAND_BLUE }}>
          {[
            [buildingCount, copy.city],
            [countryCount, copy.country],
            [continentCount, copy.continent],
          ].map(([value, label]) => (
            <div key={label}>
              <p className="m-0 text-[40px] leading-none" style={{ fontFamily: '"Cormorant Garamond", Georgia, serif' }}>
                {value}
              </p>
              <p className="m-0 mt-4 text-[15px] font-semibold">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MapPage({
  memories,
  focusMemoryId,
  placementNotice,
  textNotice,
  isActive,
  onRequestAdd,
  onDeleteMemory,
  onDuplicateMemory,
  onRegenerateMemory,
  onUpdateMemoryPlacement,
}: {
  memories: MobileMemory[];
  focusMemoryId?: number | null;
  placementNotice?: MapPlacementNotice | null;
  textNotice?: MapTextNotice | null;
  isActive: boolean;
  onRequestAdd: (placement: MobileMapPlacement | null) => void;
  onDeleteMemory: (memory: MobileMemory) => void;
  onDuplicateMemory: (memory: MobileMemory) => number;
  onRegenerateMemory: (memory: MobileMemory, userPrompt?: string) => Promise<void>;
  onUpdateMemoryPlacement: (memory: MobileMemory, placement: MobileMapPlacement) => void;
}) {
  const { language } = useLocalization();
  const copy = MOBILE_COPY[language];
  const sectionRef = useRef<HTMLElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxAdapter | null>(null);
  const mapUserInteractedRef = useRef(false);
  const initialMapCenteredRef = useRef(false);
  const [query, setQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState<SearchSuggestion[]>([]);
  const [basemapTheme, setBasemapTheme] = useState<BasemapThemeId>('mist');
  const [showBasemapMenu, setShowBasemapMenu] = useState(false);
  const [selectedSlotKey, setSelectedSlotKey] = useState<string | null>(
    memories[0] ? mobileMemorySlotKey(memories[0], 0) : null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [viewportTick, setViewportTick] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<'load' | 'token' | null>(null);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [photoPreviewIndex, setPhotoPreviewIndex] = useState<number | null>(null);
  const [cardsOpen, setCardsOpen] = useState(false);
  const lastGenerationErrorNoticeRef = useRef<string | null>(null);
  const [unlockedMemoryIds, setUnlockedMemoryIds] = useState<Set<number>>(() => new Set());
  const [lockedMemoryIds, setLockedMemoryIds] = useState<Set<number>>(() => new Set());
  const [memoryAdjustments, setMemoryAdjustments] = useState<Map<string, MobileMemoryAdjustment>>(() => new Map());
  const [draggingMemory, setDraggingMemory] = useState<DraggingMobileMemory | null>(null);
  const markerRefs = useRef(new Map<string, HTMLButtonElement>());
  const syncMarkerDomPositionsRef = useRef<() => void>(() => {});
  const [selectedMarkerFrame, setSelectedMarkerFrame] = useState<{
    point: { x: number; y: number };
    size: number;
  } | null>(null);
  const [statusFlashKey, setStatusFlashKey] = useState(0);
  const visibleMemories = useMemo(() => getActiveMobileMemories(memories), [memories]);
  const visibleMemorySlots = useMemo(
    () => visibleMemories.map((memory, index) => ({
      memory,
      index,
      slotKey: mobileMemorySlotKey(memory, index),
    })),
    [visibleMemories],
  );
  const selectedSlot = visibleMemorySlots.find((slot) => slot.slotKey === selectedSlotKey) ?? null;
  const selectedMemory = selectedSlot?.memory ?? null;

  const centerInitialMapOnUser = useCallback((map = mapRef.current) => {
    if (!map || initialMapCenteredRef.current || mapUserInteractedRef.current) return;
    initialMapCenteredRef.current = true;
    void (async () => {
      const anchor = await resolveSessionAnchor();
      if (mapRef.current !== map || mapUserInteractedRef.current) return;
      map.setView([anchor.lat, anchor.lng], MOBILE_INITIAL_BUILDING_ZOOM);
      setViewportTick((tick) => tick + 1);
    })();
  }, []);

  useEffect(() => {
    if (!visibleMemorySlots.length) {
      setSelectedSlotKey(null);
      setCardsOpen(false);
      return;
    }
    if (selectedSlotKey && !visibleMemorySlots.some((slot) => slot.slotKey === selectedSlotKey)) {
      setSelectedSlotKey(visibleMemorySlots[0].slotKey);
      setCardsOpen(false);
    }
  }, [selectedSlotKey, visibleMemorySlots]);

  useEffect(() => {
    if (!mapReady) return;
    centerInitialMapOnUser();
  }, [centerInitialMapOnUser, mapReady]);

  useEffect(() => {
    if (!focusMemoryId || !mapReady) return;
    const slot = visibleMemorySlots.find((item) => item.memory.id === focusMemoryId);
    if (!slot) return;
    setSelectedSlotKey(slot.slotKey);
    setCardsOpen(!slot.memory.isGenerating);
    if (slot.memory.lat != null && slot.memory.lng != null) {
      mapRef.current?.setView([slot.memory.lat, slot.memory.lng], Math.max(mapRef.current?.getZoom?.() ?? 4.2, 4.2));
    }
  }, [focusMemoryId, mapReady, visibleMemorySlots]);

  const projectMemoryPoints = useCallback(() => {
    const width = sectionRef.current?.clientWidth || window.innerWidth || 390;
    const height = sectionRef.current?.clientHeight || window.innerHeight || 844;
    const positionCounts = new Map<string, number>();
    return visibleMemories.map((memory, index) => {
        const slotKey = mobileMemorySlotKey(memory, index);
        const adjustment = memoryAdjustments.get(slotKey);
        const lat = adjustment?.lat ?? memory.lat;
        const lng = adjustment?.lng ?? memory.lng;
        let point: { x: number; y: number };
        const positionKey =
          lat != null && lng != null
            ? `${lat.toFixed(4)},${lng.toFixed(4)}`
            : `fallback-${memory.id}`;
        if (mapRef.current && lat != null && lng != null) {
          point = mapRef.current.latLngToContainerPoint([lat, lng]);
        } else {
          point = {
            x: width * (index % 2 === 0 ? 0.38 : 0.75),
            y: height * (0.36 + (index % 4) * 0.12),
          };
        }
        const duplicateIndex = positionCounts.get(positionKey) ?? 0;
        positionCounts.set(positionKey, duplicateIndex + 1);
        if (duplicateIndex > 0) {
          const angle = (duplicateIndex - 1) * (Math.PI / 3);
          const radius = 26;
          point = {
            x: point.x + Math.cos(angle) * radius,
            y: point.y + Math.sin(angle) * radius,
          };
        }
        return { slotKey, point };
      });
  }, [memoryAdjustments, visibleMemories]);

  const syncMarkerDomPositions = useCallback(() => {
    projectMemoryPoints().forEach(({ slotKey, point }) => {
      const marker = markerRefs.current.get(slotKey);
      if (!marker) return;
      marker.style.left = `${point.x}px`;
      marker.style.top = `${point.y}px`;
    });
  }, [projectMemoryPoints]);

  useEffect(() => {
    syncMarkerDomPositionsRef.current = syncMarkerDomPositions;
  }, [syncMarkerDomPositions]);

  const memoryPoints = useMemo(() => {
    return new Map(projectMemoryPoints().map(({ slotKey, point }) => [slotKey, point] as const));
  }, [projectMemoryPoints, viewportTick]);
  const selectedPoint = selectedSlot
    ? memoryPoints.get(selectedSlot.slotKey) ?? null
    : null;
  const selectedAdjustment = selectedSlot ? memoryAdjustments.get(selectedSlot.slotKey) : undefined;
  const isMemoryUnlocked = useCallback((memory: MobileMemory) => (
    !lockedMemoryIds.has(memory.id) && (memory.defaultUnlocked === true || unlockedMemoryIds.has(memory.id))
  ), [lockedMemoryIds, unlockedMemoryIds]);
  const selectedMemoryForImage = selectedMemory && selectedAdjustment
    ? {
        ...selectedMemory,
        lat: selectedAdjustment.lat ?? selectedMemory.lat,
        lng: selectedAdjustment.lng ?? selectedMemory.lng,
      }
    : selectedMemory;
  const currentZoom = mapReady && mapRef.current ? mapRef.current.getZoom?.() ?? 2 : 2;
  const showDotMarkers = currentZoom <= MOBILE_DOT_ZOOM_THRESHOLD;
  const buildingZoomScale = mapBuildingZoomScale(currentZoom);
  const selectedRenderAdjustment: MobileMemoryAdjustment | undefined = selectedMemory
    ? {
        ...selectedAdjustment,
        scale: (selectedAdjustment?.scale ?? 1) * buildingZoomScale,
      }
    : undefined;
  const selectedImage = selectedMemory && selectedPoint
    ? processedImageFromMemory(selectedMemoryForImage ?? selectedMemory, selectedPoint, !isMemoryUnlocked(selectedMemory), selectedRenderAdjustment)
    : null;
  const selectedMemoryForStatus = selectedMemory && selectedAdjustment
    ? {
        ...selectedMemory,
        lat: selectedAdjustment.lat ?? selectedMemory.lat,
        lng: selectedAdjustment.lng ?? selectedMemory.lng,
      }
    : selectedMemory;
  const selectedMemoryStatus = selectedMemoryForStatus ? formatMapMemoryStatus(selectedMemoryForStatus, language) : null;

  const flashSelectedStatus = useCallback(() => {
    setStatusFlashKey((key) => key + 1);
  }, []);

  const getMapCenterPlacement = useCallback((): MobileMapPlacement | null => {
    const map = mapRef.current;
    const container = map?.getContainer?.();
    if (!map || !container) return null;
    const center = map.containerPointToLatLng({
      x: container.clientWidth / 2,
      y: container.clientHeight / 2,
    });
    return {
      lat: center.lat,
      lng: center.lng,
      location: copy.currentLocation,
    };
  }, [copy.currentLocation]);

  const updateMemoryAdjustment = useCallback((slotKey: string, patch: MobileMemoryAdjustment) => {
    setMemoryAdjustments((current) => {
      const next = new Map(current);
      next.set(slotKey, { ...next.get(slotKey), ...patch });
      return next;
    });
  }, []);

  const startMemoryDrag = useCallback((
    event: React.PointerEvent<HTMLButtonElement>,
    slotKey: string,
    memory: MobileMemory,
    isLocked: boolean,
  ) => {
    event.stopPropagation();
    setSelectedSlotKey(slotKey);
    setCardsOpen(true);

    if (isLocked || showDotMarkers || !mapRef.current) return;

    const adjustment = memoryAdjustments.get(slotKey);
    const lat = adjustment?.lat ?? memory.lat;
    const lng = adjustment?.lng ?? memory.lng;
    if (lat == null || lng == null) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDraggingMemory({
      slotKey,
      startX: event.clientX,
      startY: event.clientY,
      startLat: lat,
      startLng: lng,
    });
  }, [memoryAdjustments, showDotMarkers]);

  const moveMemoryDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>, slotKey: string) => {
    if (!draggingMemory || draggingMemory.slotKey !== slotKey || !mapRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const startPoint = mapRef.current.latLngToContainerPoint([draggingMemory.startLat, draggingMemory.startLng]);
    const nextPoint = {
      x: startPoint.x + event.clientX - draggingMemory.startX,
      y: startPoint.y + event.clientY - draggingMemory.startY,
    };
    const nextLatLng = mapRef.current.containerPointToLatLng(nextPoint);
    updateMemoryAdjustment(slotKey, { lat: nextLatLng.lat, lng: nextLatLng.lng });
    setViewportTick((tick) => tick + 1);
  }, [draggingMemory, updateMemoryAdjustment]);

  const endMemoryDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggingMemory) return;
    event.stopPropagation();
    const committedSlotKey = draggingMemory.slotKey;
    const committedSlot = visibleMemorySlots.find((slot) => slot.slotKey === committedSlotKey);
    const committedAdjustment = memoryAdjustments.get(committedSlotKey);
    if (
      committedSlot &&
      committedAdjustment &&
      typeof committedAdjustment.lat === 'number' &&
      typeof committedAdjustment.lng === 'number'
    ) {
      onUpdateMemoryPlacement(committedSlot.memory, {
        lat: committedAdjustment.lat,
        lng: committedAdjustment.lng,
        location: committedSlot.memory.region,
      });
      flashSelectedStatus();
    }
    setDraggingMemory(null);
    setViewportTick((tick) => tick + 1);
  }, [draggingMemory, flashSelectedStatus, memoryAdjustments, onUpdateMemoryPlacement, visibleMemorySlots]);

  const updateSelectedMarkerFrame = useCallback(() => {
    if (!selectedSlotKey || !sectionRef.current) return;
    const marker = markerRefs.current.get(selectedSlotKey);
    if (!marker) return;
    const sectionRect = sectionRef.current.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const next = {
      point: {
        x: markerRect.left - sectionRect.left + markerRect.width / 2,
        y: markerRect.top - sectionRect.top + markerRect.height / 2,
      },
      size: Math.max(markerRect.width, markerRect.height),
    };
    setSelectedMarkerFrame((previous) => {
      if (
        previous &&
        Math.abs(previous.point.x - next.point.x) < 0.5 &&
        Math.abs(previous.point.y - next.point.y) < 0.5 &&
        Math.abs(previous.size - next.size) < 0.5
      ) {
        return previous;
      }
      return next;
    });
  }, [selectedSlotKey]);

  useEffect(() => {
    const update = () => setViewportTick((tick) => tick + 1);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (!cardsOpen || !selectedSlotKey) {
      setSelectedMarkerFrame(null);
      return;
    }
    const frameId = window.requestAnimationFrame(updateSelectedMarkerFrame);
    const timerId = window.setTimeout(updateSelectedMarkerFrame, 260);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timerId);
    };
  }, [cardsOpen, selectedSlotKey, updateSelectedMarkerFrame, viewportTick]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    let cancelled = false;
    const readyTimers: number[] = [];
    void (async () => {
      try {
        const mapboxgl = await loadMapbox(deploymentConfig.mapboxAccessToken);
        if (cancelled || !mapContainerRef.current) return;
        const map = new MapboxAdapter(mapboxgl, mapContainerRef.current, {
          center: [15, 0],
          zoom: 2,
          minZoom: 1,
          maxZoom: 18,
          style: MOBILE_MAPBOX_STYLE,
          fallbackStyle: createRasterFallbackStyle(
            deploymentConfig.mapTileUrl,
            deploymentConfig.mapTileAttribution
          ),
        });
        map.setBasemapTheme(basemapTheme);
        map.applyEditorialStyle();
        let rafId = 0;
        const markMapInteraction = () => {
          mapUserInteractedRef.current = true;
        };
        const updateViewport = () => {
          syncMarkerDomPositionsRef.current();
          if (rafId) return;
          rafId = window.requestAnimationFrame(() => {
            rafId = 0;
            syncMarkerDomPositionsRef.current();
            setViewportTick((tick) => tick + 1);
          });
        };
        map.on('move', updateViewport);
        map.on('moveend', updateViewport);
        map.on('zoom', updateViewport);
        map.on('render', updateViewport);
        map.on('idle', updateViewport);
        map.on('style.load', updateViewport);
        map.on('dragstart', markMapInteraction);
        mapRef.current = map;
        map.whenReady(() => {
          if (cancelled || mapRef.current !== map) return;
          const kick = () => {
            if (cancelled || mapRef.current !== map) return;
            map.refreshRender();
            updateViewport();
          };
          kick();
          centerInitialMapOnUser(map);
          requestAnimationFrame(kick);
          readyTimers.push(window.setTimeout(() => {
            kick();
            centerInitialMapOnUser(map);
          }, 180));
          readyTimers.push(window.setTimeout(() => {
            kick();
            centerInitialMapOnUser(map);
          }, 600));
          setMapReady(true);
        });
      } catch (error) {
        console.error('Mobile Mapbox init failed', error);
        setMapError(deploymentConfig.mapboxAccessToken ? 'load' : 'token');
      }
    })();
    return () => {
      cancelled = true;
      readyTimers.forEach((timer) => window.clearTimeout(timer));
      mapRef.current?.destroy?.();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    mapRef.current?.setBasemapTheme(basemapTheme);
    mapRef.current?.applyEditorialStyle();
  }, [basemapTheme]);

  useEffect(() => {
    const map = mapRef.current;
    const container = mapContainerRef.current;
    if (!mapReady || !map || !container) return;
    const fixMapSize = () => {
      map.refreshRender();
      setViewportTick((tick) => tick + 1);
    };
    fixMapSize();
    const timerOne = window.setTimeout(fixMapSize, 80);
    const timerTwo = window.setTimeout(fixMapSize, 360);
    const timerThree = window.setTimeout(fixMapSize, 900);
    const observer = new ResizeObserver(fixMapSize);
    observer.observe(container);
    window.addEventListener('resize', fixMapSize);
    return () => {
      window.clearTimeout(timerOne);
      window.clearTimeout(timerTwo);
      window.clearTimeout(timerThree);
      observer.disconnect();
      window.removeEventListener('resize', fixMapSize);
    };
  }, [mapReady]);

  useEffect(() => {
    if (!isActive || !mapReady) return;
    const refreshVisibleMap = () => {
      mapRef.current?.refreshRender();
      setViewportTick((tick) => tick + 1);
    };
    const frameId = window.requestAnimationFrame(refreshVisibleMap);
    const timerId = window.setTimeout(refreshVisibleMap, 120);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timerId);
    };
  }, [isActive, mapReady]);

  useEffect(() => {
    if (photoPreviewIndex === null) return;
    const photoCount = selectedImage?.photos.length ?? 0;
    if (!selectedImage || photoPreviewIndex >= photoCount) {
      setPhotoPreviewIndex(null);
    }
  }, [photoPreviewIndex, selectedImage]);

  const flashNotice = useCallback((text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(null), 1800);
  }, []);

  useEffect(() => {
    if (!selectedMemory?.generationError) return;
    const noticeKey = `${selectedMemory.id}:${selectedMemory.generationError}`;
    if (lastGenerationErrorNoticeRef.current === noticeKey) return;
    lastGenerationErrorNoticeRef.current = noticeKey;
    flashNotice(selectedMemory.generationError);
  }, [flashNotice, selectedMemory?.generationError, selectedMemory?.id]);

  useEffect(() => {
    if (!textNotice) return;
    flashNotice(textNotice.text);
  }, [flashNotice, textNotice]);

  useEffect(() => {
    const q = query.trim();
    if (!searchActive || q.length < 2) {
      setSearchSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(buildPlaceSearchUrl(q, language, 5));
          if (!response.ok) {
            if (!cancelled) setSearchSuggestions([]);
            return;
          }
          const data = parseSearchSuggestions(await response.json());
          if (!cancelled) setSearchSuggestions(data);
        } catch (error) {
          console.error('Mobile location search suggestions failed', error);
          if (!cancelled) setSearchSuggestions([]);
        }
      })();
    }, 260);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [language, query, searchActive]);

  const chooseLocationSuggestion = useCallback((suggestion: SearchSuggestion) => {
    setQuery(suggestion.label);
    setSearchSuggestions([]);
    setSearchActive(false);
    setCardsOpen(false);
    mapUserInteractedRef.current = true;
    mapRef.current?.setView([suggestion.lat, suggestion.lng], Math.max(mapRef.current?.getZoom?.() ?? 4.8, 5));
    flashNotice(suggestion.label);
  }, [flashNotice]);

  const search = useCallback(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      flashNotice(copy.typeLocationFirst);
      return;
    }
    const match = memories.find((memory) =>
      `${memory.place} ${memory.region}`.toLowerCase().includes(q)
    );
    if (!match) {
      const suggestion = searchSuggestions[0];
      if (suggestion) {
        chooseLocationSuggestion(suggestion);
        return;
      }
      void (async () => {
        try {
          const response = await fetch(buildPlaceSearchUrl(query.trim(), language, 5));
          if (response.ok) {
            const data = parseSearchSuggestions(await response.json());
            if (data[0]) {
              chooseLocationSuggestion(data[0]);
              return;
            }
          }
          flashNotice(copy.noMatchingMemory);
        } catch (error) {
          console.error('Mobile location search failed', error);
          flashNotice(copy.noMatchingMemory);
        }
      })();
      return;
    }
    const matchSlot = visibleMemorySlots.find((slot) => slot.memory.id === match.id);
    setSelectedSlotKey(matchSlot?.slotKey ?? mobileMemorySlotKey(match, 0));
    setCardsOpen(true);
    if (match.lat != null && match.lng != null) {
      mapUserInteractedRef.current = true;
      mapRef.current?.setView([match.lat, match.lng], Math.max(mapRef.current?.getZoom?.() ?? 2.8, 3.6));
    }
  }, [chooseLocationSuggestion, copy, flashNotice, language, memories, query, searchSuggestions, visibleMemorySlots]);

  const goToCurrentLocation = useCallback(() => {
    void (async () => {
      const anchor = await resolveSessionAnchor();
      mapUserInteractedRef.current = true;
      mapRef.current?.setView([anchor.lat, anchor.lng], Math.max(mapRef.current?.getZoom?.() ?? 5, 5));
      flashNotice(copy.currentLocation);
    })();
  }, [copy.currentLocation, flashNotice]);

  const chooseBasemapTheme = useCallback((themeId: BasemapThemeId, label: string) => {
    setBasemapTheme(themeId);
    setShowBasemapMenu(false);
    mapRef.current?.setBasemapTheme(themeId);
    flashNotice(`${label} ${copy.styleSuffix}`);
  }, [copy.styleSuffix, flashNotice]);

  const downloadCurrentMap = useCallback(() => {
    const target = selectedMemory ?? visibleMemories[0];
    if (!target?.imageSrc) {
      flashNotice(copy.selectBuildingFirst);
      return;
    }
    const link = document.createElement('a');
    link.href = target.imageSrc;
    link.download = `${target.place || 'echo-map-memory'}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    flashNotice(copy.downloadStarted);
  }, [copy, flashNotice, selectedMemory, visibleMemories]);

  const dismissSelection = useCallback(() => {
    setCardsOpen(false);
    setSelectedMarkerFrame(null);
    setPhotoPreviewIndex(null);
    setDraggingMemory(null);
  }, []);

  const handleMapCanvasPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!cardsOpen) return;
    if (photoPreviewIndex !== null || showPhotoModal || showAudioModal || showLogModal) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (
      target.closest('[data-selection-overlay]') ||
      target.closest('.echo-mobile-item') ||
      target.closest('.echo-map-zoom') ||
      target.closest('.echo-map-orb') ||
      target.closest('.echo-mobile-search') ||
      target.closest('.echo-map-search-suggestions') ||
      target.closest('.mapboxgl-control-container')
    ) {
      return;
    }
    dismissSelection();
  }, [cardsOpen, dismissSelection, photoPreviewIndex, showAudioModal, showLogModal, showPhotoModal]);

  return (
    <section
      ref={sectionRef}
      className="mobile-screen echo-map-canvas relative h-[100dvh] overflow-hidden"
      onPointerDown={handleMapCanvasPointerDown}
    >
      <div ref={mapContainerRef} className="echo-mobile-map-layer absolute inset-0 z-[1] h-full w-full" />
      {mapError && (
        <div className="absolute inset-0 z-[4] flex items-center justify-center text-[14px]" style={{ color: '#344b57', fontFamily: MONO_FONT }}>
          {mapError === 'load' ? copy.mapboxLoadFailed : copy.mapboxTokenMissing}
        </div>
      )}
      <div className="absolute inset-0 z-[3] pointer-events-none">
        {visibleMemories.map((memory, index) => {
          const slotKey = mobileMemorySlotKey(memory, index);
          const selected = cardsOpen && selectedSlotKey === slotKey;
          const point = memoryPoints.get(slotKey);
          const adjustment = memoryAdjustments.get(slotKey);
          const isLocked = !isMemoryUnlocked(memory);
          const renderAsDot = showDotMarkers;
          const markerScale = (adjustment?.scale ?? 1) * (renderAsDot ? 1 : buildingZoomScale);
          const dotColor = getPoiDotColor(slotKey);
          const baseDotSize = getPoiDotSize(slotKey, 15, 8);
          const dotSize = selected ? baseDotSize + 3 : baseDotSize;
          const dotRingSize = selected ? dotSize + 8 : dotSize + 6;
          const dotGlowSize = selected ? dotSize + 31 : dotSize + 27;
          const markerSize = (index === 0 ? 112 : 100) * markerScale;
          const markerImageWidth = (index === 0 ? 100 : 85) * markerScale;
          const markerImageHeight = (index === 0 ? 75 : 78) * markerScale;
          const generatingMarkerSize = Math.max(markerImageWidth, markerImageHeight);
          const isGenerating = memory.isGenerating === true;
          const generatingPhotoSrc = latestMobilePhoto(memory.photos)?.url ?? memory.photos?.[0]?.url;
          return (
            <button
              ref={(node) => {
                if (node) markerRefs.current.set(slotKey, node);
                else markerRefs.current.delete(slotKey);
              }}
              key={slotKey}
              type="button"
              onPointerDown={(event) => startMemoryDrag(event, slotKey, memory, isLocked)}
              onPointerMove={(event) => moveMemoryDrag(event, slotKey)}
              onPointerUp={endMemoryDrag}
              onPointerCancel={endMemoryDrag}
              onClick={() => {
                mapUserInteractedRef.current = true;
                setSelectedSlotKey(slotKey);
                setCardsOpen(!memory.isGenerating);
                flashSelectedStatus();
              }}
              className="echo-mobile-item pointer-events-auto absolute flex items-center justify-center rounded-full transition-transform duration-200"
              style={{
                left: point ? `${point.x}px` : index === 0 ? '38%' : '75%',
                top: point ? `${point.y}px` : index === 0 ? '42%' : '58%',
                width: renderAsDot && !isGenerating ? dotGlowSize : markerSize,
                height: renderAsDot && !isGenerating ? dotGlowSize : markerSize,
                transform: `translate(-50%, -50%) scale(${selected && !renderAsDot ? 1.1 : 1})`,
                zIndex: selected ? 24 : isGenerating ? 18 : Math.max(1, visibleMemories.length - index),
                animationDelay: `${index * 90}ms`,
                cursor: !isLocked && !renderAsDot && !isGenerating ? 'grab' : 'pointer',
                touchAction: !isLocked && !renderAsDot && !isGenerating ? 'none' : 'manipulation',
              }}
              aria-label={`Open ${memory.place}`}
            >
              {isGenerating ? (
                <>
                  <span
                    className="echo-mobile-generating-marker"
                    style={{
                      width: generatingMarkerSize,
                      height: generatingMarkerSize,
                    }}
                    aria-hidden
                  >
                    {generatingPhotoSrc && (
                      <img
                        src={generatingPhotoSrc}
                        alt=""
                        className="echo-mobile-generating-preview"
                        draggable={false}
                      />
                    )}
                    <GeneratingEllipsis />
                  </span>
                </>
              ) : renderAsDot ? (
                <>
                  <span
                    className="absolute rounded-full"
                    style={{
                      width: dotGlowSize,
                      height: dotGlowSize,
                      background: `radial-gradient(circle, ${dotColor}42 0%, ${dotColor}20 44%, transparent 76%)`,
                      filter: 'blur(1.5px)',
                      opacity: selected ? 0.62 : 0.48,
                    }}
                  />
                  <span
                    className="absolute rounded-full"
                    style={{
                      width: dotRingSize,
                      height: dotRingSize,
                      background: `radial-gradient(circle, rgba(255,255,255,0.94) 0%, ${dotColor}24 58%, ${dotColor}58 100%)`,
                      border: `1.5px solid ${dotColor}`,
                      boxShadow: `0 2px 7px rgba(14,66,130,0.14), 0 0 10px ${dotColor}3d`,
                    }}
                  />
                  <span
                    className="relative rounded-full"
                    style={{
                      width: dotSize,
                      height: dotSize,
                      background: dotColor,
                      boxShadow: `0 0 0 1px rgba(255,255,255,0.92), 0 0 8px ${dotColor}78, 0 0 18px ${dotColor}24`,
                      opacity: selected ? 1 : 0.92,
                    }}
                  />
                </>
              ) : (
                <>
                  {selected && <span className="absolute inset-0 rounded-full border-2 border-dashed border-black/85" />}
                  <img
                    src={memory.imageSrc || fallbackImageForMemory(memory)}
                    alt=""
                    className="echo-mobile-building-image h-full w-full object-contain drop-shadow-[0_12px_20px_rgba(52,75,87,.14)]"
                    style={{
                      width: markerImageWidth,
                      height: markerImageHeight,
                      transform: adjustment?.flippedHorizontally ? 'scaleX(-1)' : 'none',
                    }}
                    onError={(event) => {
                      const fallback = fallbackImageForMemory(memory);
                      if (event.currentTarget.src !== new URL(fallback, window.location.href).href) {
                        event.currentTarget.src = fallback;
                      }
                    }}
                    draggable={false}
                  />
                </>
              )}
            </button>
          );
        })}
      </div>
      <div className="echo-map-zoom absolute left-3 top-12 z-10 grid bg-white/70" style={{ fontFamily: MONO_FONT }}>
        <button
          type="button"
          onClick={() => {
            mapUserInteractedRef.current = true;
            mapRef.current?.zoomIn();
            window.setTimeout(() => setViewportTick((tick) => tick + 1), 220);
          }}
          disabled={!mapReady}
          className={`echo-map-zoom-button flex h-6 w-6 items-center justify-center ${mapReady ? '' : 'opacity-40'}`}
          aria-label="Zoom in"
        >
          <span className="h-3.5 w-3.5"><EchoPlusIcon strokeWidth={1.3} /></span>
        </button>
        <button
          type="button"
          onClick={() => {
            mapUserInteractedRef.current = true;
            mapRef.current?.zoomOut();
            window.setTimeout(() => setViewportTick((tick) => tick + 1), 220);
          }}
          disabled={!mapReady}
          className={`flex h-6 w-6 items-center justify-center ${mapReady ? '' : 'opacity-40'}`}
          aria-label="Zoom out"
        >
          <span className="h-3.5 w-3.5"><EchoMinusIcon strokeWidth={1.3} /></span>
        </button>
      </div>
      <form
        className="echo-mobile-search echo-map-search absolute left-1/2 top-12 z-10 flex w-[66%] min-w-[250px] max-w-[330px] -translate-x-1/2 bg-white"
        style={{ fontFamily: MONO_FONT }}
        onBlur={() => window.setTimeout(() => setSearchActive(false), 120)}
        onSubmit={(event) => {
          event.preventDefault();
          search();
        }}
      >
        <input
          className="min-w-0 flex-1 bg-transparent px-4 text-[16px] outline-none"
          placeholder={copy.searchLocation}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSearchActive(true);
          }}
          onFocus={() => setSearchActive(true)}
        />
        <button type="submit" className="echo-mobile-search-action flex items-center justify-center" aria-label={copy.searchLocation}>
          <span className="h-5 w-5"><EchoSearchIcon strokeWidth={1.4} /></span>
        </button>
        {searchActive && searchSuggestions.length > 0 && (
          <div className="echo-map-search-suggestions absolute left-0 right-0 top-full z-40 max-h-[168px] overflow-y-auto bg-white">
            {searchSuggestions.map((suggestion) => (
              <button
                key={suggestion.key}
                type="button"
                className="block w-full border-0 bg-transparent px-4 py-2 text-left text-[14px] text-black hover:bg-[#eef5ff]"
                style={{ fontFamily: MONO_FONT }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  chooseLocationSuggestion(suggestion);
                }}
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        )}
      </form>
      <div className="absolute right-3 top-12 z-10 grid gap-[10px]">
        {[
          [copy.mapStyle, <EchoMapStyleIcon strokeWidth={1.4} />, () => setShowBasemapMenu((open) => !open)],
          [copy.currentLocation, <EchoLocationPinIcon strokeWidth={1.4} />, goToCurrentLocation],
        ].map(([label, icon, action]) => (
          <button
            key={label as string}
            type="button"
            onClick={action as () => void}
            className="echo-glass-orb echo-map-orb flex h-8 w-8 items-center justify-center rounded-full text-black"
          aria-label={label as string}
        >
            <span className="grid h-[19px] w-[19px] place-items-center">{icon}</span>
          </button>
        ))}
      </div>
      {showBasemapMenu && (
        <div className="absolute right-12 top-[5.9rem] z-30 min-w-[156px] border border-black bg-white px-2 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.1)]">
          {BASEMAP_THEME_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => chooseBasemapTheme(option.id, option.label)}
              className="flex w-full items-center justify-between border-0 bg-transparent px-3 py-2 text-left text-sm hover:bg-neutral-100"
              style={{ fontFamily: MONO_FONT }}
            >
              <span>{option.label}</span>
              {basemapTheme === option.id ? <span>•</span> : null}
            </button>
          ))}
        </div>
      )}
      <div className="absolute bottom-[11%] left-1/2 z-10 flex -translate-x-1/2 gap-[10px]">
        <button
          className="echo-glass-orb echo-map-orb flex h-8 w-8 items-center justify-center rounded-full text-black"
          type="button"
          onClick={() => {
            setCardsOpen(false);
            setShowPhotoModal(false);
            onRequestAdd(getMapCenterPlacement());
          }}
          aria-label={copy.camera}
        >
          <span className="h-[19px] w-[19px]"><EchoCameraIcon strokeWidth={1.4} /></span>
        </button>
        <button
          className="echo-glass-orb echo-map-orb flex h-8 w-8 items-center justify-center rounded-full text-black"
          type="button"
          onClick={downloadCurrentMap}
          aria-label={copy.download}
        >
          <span className="h-[19px] w-[19px]"><EchoDownloadIcon strokeWidth={1.4} /></span>
        </button>
      </div>
      {notice && (
        <div className="echo-map-text-toast absolute left-1/2 top-[6.6rem] z-20 -translate-x-1/2 px-4 py-2 text-center">
          {notice}
        </div>
      )}
      {cardsOpen && selectedMemoryStatus && statusFlashKey > 0 && (
        <div
          key={`${selectedSlotKey ?? 'status'}-${statusFlashKey}`}
          className="echo-map-status absolute left-1/2 top-[8.25rem] z-20 flex -translate-x-1/2 flex-wrap justify-center gap-x-3 gap-y-1 text-[14px] leading-snug"
          style={{ color: INK, fontFamily: UI_FONT, fontWeight: 500 }}
        >
          <span>{selectedMemoryStatus.lat}</span>
          <span>{selectedMemoryStatus.lng}</span>
          <span>{selectedMemoryStatus.city}</span>
        </div>
      )}
      {placementNotice && (
        <div
          key={placementNotice.id}
          className="echo-location-found-toast echo-map-text-toast absolute left-1/2 top-[6.6rem] z-20 max-w-[min(34rem,calc(100%-3rem))] -translate-x-1/2 px-4 py-2 text-center"
        >
          <span>{copy.locationFound} {placementNotice.location}.</span>
        </div>
      )}
      {cardsOpen && selectedImage && mapRef.current && selectedImage.isLocked && !selectedImage.isGenerating && (
        <MemoryCards
          selectedImage={selectedImage}
          map={mapRef.current}
          selectedScreenPoint={selectedPoint}
          selectedMarkerSize={selectedMarkerFrame?.size ?? ((selectedSlot?.index === 0 ? 112 : 100) * (selectedAdjustment?.scale ?? 1) * buildingZoomScale)}
          mapViewportTick={viewportTick}
          onUnlock={() => {
            setLockedMemoryIds((current) => {
              const next = new Set(current);
              next.delete(selectedImage.id);
              return next;
            });
            setUnlockedMemoryIds((current) => {
              const next = new Set(current);
              next.add(selectedImage.id);
              return next;
            });
            setSelectedMarkerFrame(null);
            setViewportTick((tick) => tick + 1);
          }}
          onViewPhoto={(photoIndex) => setPhotoPreviewIndex(photoIndex)}
          onOpenPhotoModal={() => setShowPhotoModal(true)}
          onOpenAudioModal={() => setShowAudioModal(true)}
          onEditLog={() => setShowLogModal(true)}
        />
      )}
      {cardsOpen && selectedImage && mapRef.current && !selectedImage.isLocked && !selectedImage.isGenerating && !selectedMemory?.generationError && (
        <Toolbar
          selectedImage={selectedImage}
          map={mapRef.current}
          selectedScreenPoint={selectedPoint ?? undefined}
          mapViewportTick={viewportTick}
          onRegenerate={() => {
            if (!selectedMemory) return;
            void onRegenerateMemory(selectedMemory)
              .then(() => flashNotice(copy.saved))
              .catch((error) => {
                console.error('Mobile toolbar regeneration failed', error);
                flashNotice(mobileGenerationErrorMessage(error, copy.generationFailed, language));
              });
          }}
          onFlip={() => {
            if (selectedSlot) {
              updateMemoryAdjustment(selectedSlot.slotKey, {
                flippedHorizontally: !(memoryAdjustments.get(selectedSlot.slotKey)?.flippedHorizontally),
              });
              setViewportTick((tick) => tick + 1);
            }
            flashNotice(copy.saved);
          }}
          onDuplicate={() => {
            if (selectedMemory) {
              const duplicateId = onDuplicateMemory({
                ...selectedMemory,
                lat: selectedImage.lat + 0.18,
                lng: selectedImage.lng + 0.18,
              });
              setUnlockedMemoryIds((current) => {
                const next = new Set(current);
                next.add(duplicateId);
                return next;
              });
              setLockedMemoryIds((current) => {
                const next = new Set(current);
                next.delete(duplicateId);
                return next;
              });
              setCardsOpen(true);
              flashNotice(copy.saved);
            }
          }}
          onScale={(factor) => {
            if (selectedSlot) {
              const currentScale = memoryAdjustments.get(selectedSlot.slotKey)?.scale ?? 1;
              updateMemoryAdjustment(selectedSlot.slotKey, {
                scale: Math.min(1.55, Math.max(0.65, currentScale * factor)),
              });
              setSelectedMarkerFrame(null);
              setViewportTick((tick) => tick + 1);
            }
          }}
          onDelete={() => {
            const nextSlotKey = visibleMemorySlots.find((slot) => slot.slotKey !== selectedSlot?.slotKey)?.slotKey ?? null;
            if (selectedMemory) {
              onDeleteMemory(selectedMemory);
              setUnlockedMemoryIds((current) => {
                const next = new Set(current);
                next.delete(selectedMemory.id);
                return next;
              });
              setLockedMemoryIds((current) => {
                const next = new Set(current);
                next.delete(selectedMemory.id);
                return next;
              });
            }
            if (selectedSlot) {
              setMemoryAdjustments((current) => {
                const next = new Map(current);
                next.delete(selectedSlot.slotKey);
                return next;
              });
            }
            setCardsOpen(false);
            setSelectedSlotKey(nextSlotKey);
            setDraggingMemory(null);
            flashNotice(copy.saved);
          }}
          onEdit={(prompt) => {
            if (!selectedMemory) return;
            void onRegenerateMemory(selectedMemory, prompt)
              .then(() => flashNotice(copy.saved))
              .catch((error) => {
                console.error('Mobile toolbar edit generation failed', error);
                flashNotice(mobileGenerationErrorMessage(error, copy.generationFailed, language));
              });
          }}
          onLock={() => {
            setUnlockedMemoryIds((current) => {
              const next = new Set(current);
              next.delete(selectedImage.id);
              return next;
            });
            setLockedMemoryIds((current) => {
              const next = new Set(current);
              next.add(selectedImage.id);
              return next;
            });
            setDraggingMemory(null);
          }}
        />
      )}
      {showLogModal && selectedImage && (
        <TravelLogModal
          log={selectedImage.log}
          onSave={() => {
            setShowLogModal(false);
            flashNotice(copy.saved);
          }}
          onClose={() => setShowLogModal(false)}
        />
      )}
      {photoPreviewIndex !== null && selectedImage && selectedImage.photos.length > 0 && (
        <PhotoPreviewModal
          photos={selectedImage.photos}
          currentIndex={Math.min(photoPreviewIndex, selectedImage.photos.length - 1)}
          onClose={() => setPhotoPreviewIndex(null)}
          onNext={() =>
            setPhotoPreviewIndex((current) => {
              const count = selectedImage.photos.length;
              if (count <= 0) return null;
              return ((current ?? 0) + 1) % count;
            })
          }
          onPrevious={() =>
            setPhotoPreviewIndex((current) => {
              const count = selectedImage.photos.length;
              if (count <= 0) return null;
              return ((current ?? 0) - 1 + count) % count;
            })
          }
        />
      )}
      <MemoryPhotoModal
        open={showPhotoModal}
        onClose={() => setShowPhotoModal(false)}
        onSave={() => {
          setShowPhotoModal(false);
          onRequestAdd(getMapCenterPlacement());
        }}
      />
      <MemoryAudioModal
        open={showAudioModal}
        currentEntries={selectedImage?.audioEntries ?? []}
        onClose={() => setShowAudioModal(false)}
        onSave={() => {
          setShowAudioModal(false);
          flashNotice(copy.audioSaved);
        }}
      />
    </section>
  );
}

function FilterControl({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const copy = useMobileCopy();
  return (
    <form
      className="echo-mobile-search echo-gallery-search mx-auto flex w-[66%] min-w-[250px] max-w-[330px] bg-white"
      style={{ fontFamily: MONO_FONT }}
      role="search"
      onSubmit={(event) => event.preventDefault()}
    >
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent px-4 text-[16px] outline-none"
        placeholder={copy.filterBy}
        aria-label={copy.filterBy}
      />
      <button type="submit" className="echo-mobile-search-action flex items-center justify-center" aria-label={copy.applyFilter}>
        <span className="h-0 w-0 border-x-[9px] border-t-[13px] border-x-transparent border-t-black" />
      </button>
    </form>
  );
}

function GalleryGrid({
  memories,
  selectedId,
  onSelect,
}: {
  memories: MobileMemory[];
  selectedId?: number | null;
  onSelect?: (memory: MobileMemory, element: HTMLButtonElement) => void;
}) {
  const { language } = useLocalization();
  const copy = MOBILE_COPY[language];
  const displayMemories = useMemo(() => getMobileDisplayMemories(memories), [memories]);

  if (displayMemories.length === 0) {
    return (
      <div className="echo-gallery-grid mt-5 grid grid-cols-2 gap-x-8 px-10">
        <div
          className="flex items-center justify-center text-center text-[14px]"
          style={{ color: MUTED, fontFamily: MONO_FONT, gridColumn: '1 / -1', gridRow: '1 / -1' }}
        >
          {copy.noMatchingMemories}
        </div>
      </div>
    );
  }

  return (
    <div className="echo-gallery-grid mt-5 grid grid-cols-2 gap-x-8 px-10">
      {displayMemories.map((memory, index) => {
        const placeLabel = displayPlaceName(memory.place, language);
        const emojiSideClass = index % 2 === 0 ? 'right-[18%]' : 'left-[18%]';
        const generatingPhotoSrc = latestMobilePhoto(memory.photos)?.url ?? memory.photos?.[0]?.url;
        return (
        <button
          key={`${memory.id}-${index}`}
          type="button"
          onClick={(event) => onSelect?.(memory, event.currentTarget)}
          className="echo-mobile-item group relative min-w-0 bg-transparent text-center outline-none"
          aria-label={`Open ${placeLabel}`}
        >
          <span className={`echo-gallery-emoji pointer-events-none absolute ${emojiSideClass} top-0 z-[1] ${selectedId === memory.id ? 'opacity-100' : ''}`} aria-hidden>
            <span className="echo-gallery-moon-frame">
              <MoonFaceAvatar moon={moonForMemory(memory, index)} avatarVariant={memory.log?.avatarVariant} size={22} interactive={false} />
            </span>
            <span className="echo-gallery-moon-arrow" />
          </span>
          {memory.isGenerating ? (
            <span className="echo-gallery-generating mx-auto flex items-center justify-center">
              {generatingPhotoSrc && (
                <img
                  src={generatingPhotoSrc}
                  alt=""
                  className="echo-mobile-generating-preview"
                  draggable={false}
                />
              )}
              <GeneratingEllipsis />
            </span>
          ) : (
            <img
              src={memory.imageSrc || fallbackImageForMemory(memory)}
              alt=""
              className="echo-gallery-image mx-auto w-full object-contain transition-transform duration-150 group-hover:scale-[1.035] group-focus-visible:scale-[1.035]"
              onError={(event) => {
                const fallback = fallbackImageForMemory(memory);
                if (event.currentTarget.src !== new URL(fallback, window.location.href).href) {
                  event.currentTarget.src = fallback;
                }
              }}
            />
          )}
          <p className="echo-gallery-label m-0 truncate" style={{ color: MUTED, fontFamily: MONO_FONT }}>
            {placeLabel}
          </p>
        </button>
        );
      })}
    </div>
  );
}

function parseMemoryDate(date: string): Date | null {
  const match = date.match(/^(\d{4})[.-](\d{1,2})[.-](\d{1,2})/);
  if (!match) return null;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

type HeatmapPhotoData = PhotoData & {
  deleted?: boolean;
  isDeleted?: boolean;
  deletedAt?: string;
  deleted_at?: string;
  removedAt?: string;
};

function parseDateLike(value: string | number | undefined | null): Date | null {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const localDate = parseMemoryDate(value);
    if (localDate) return localDate;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getDeletedPhotoDate(photo: HeatmapPhotoData): Date | null {
  return parseDateLike(photo.deletedAt ?? photo.deleted_at ?? photo.removedAt);
}

function isDeletedPhoto(photo: HeatmapPhotoData): boolean {
  return Boolean(photo.deleted || photo.isDeleted || getDeletedPhotoDate(photo));
}

function getPhotoUploadDate(photo: PhotoData, memory: MobileMemory): Date | null {
  return (
    parseDateLike(photo.createdAt) ??
    (typeof photo.file?.lastModified === 'number' ? parseDateLike(photo.file.lastModified) : null) ??
    parseMemoryDate(memory.date)
  );
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function HeatmapMini({ memories }: { memories: MobileMemory[] }) {
  const copy = useMobileCopy();
  const columns = 53;
  const rows = 7;
  const levels = ['transparent', '#d9e8c1', '#b9ce9a', '#8ea56b', '#64743e'];

  const { cells, monthLabels } = useMemo(() => {
    const activityDates: Date[] = [];
    const dailyIntensity = new Map<string, number>();
    const activeMemories = memories.filter((memory) => !memory.deleted);

    activeMemories.forEach((memory) => {
      (memory.photos ?? []).forEach((rawPhoto) => {
        const photo = rawPhoto as HeatmapPhotoData;
        const deletedDate = getDeletedPhotoDate(photo);
        if (deletedDate) activityDates.push(deletedDate);
        if (isDeletedPhoto(photo)) {
          if (deletedDate) {
            const key = dateKey(deletedDate);
            dailyIntensity.set(key, (dailyIntensity.get(key) ?? 0) - 1);
          }
          return;
        }

        const uploadedDate = getPhotoUploadDate(photo, memory);
        if (!uploadedDate) return;
        activityDates.push(uploadedDate);
        const key = dateKey(uploadedDate);
        dailyIntensity.set(key, (dailyIntensity.get(key) ?? 0) + 1);
      });
    });
    activityDates.sort((a, b) => b.getTime() - a.getTime());
    const year = activityDates[0]?.getFullYear() ?? new Date().getFullYear();
    const positiveMax = Math.max(
      0,
      ...Array.from(dailyIntensity.entries())
        .filter(([key]) => key.startsWith(`${year}-`))
        .map(([, count]) => count),
    );

    const yearStart = new Date(year, 0, 1);
    const gridStart = new Date(yearStart);
    gridStart.setDate(yearStart.getDate() - yearStart.getDay());

    const heatmapCells = Array.from({ length: columns * rows }).map((_, index) => {
      const col = Math.floor(index / rows);
      const row = index % rows;
      const current = new Date(gridStart);
      current.setDate(gridStart.getDate() + col * rows + row);
      const inYear = current.getFullYear() === year;
      const count = inYear ? dailyIntensity.get(dateKey(current)) ?? 0 : 0;
      const visibleCount = Math.max(0, count);
      const level = positiveMax > 0 ? Math.ceil((visibleCount / positiveMax) * (levels.length - 1)) : 0;
      return {
        id: `${col}-${row}`,
        col,
        row,
        inYear,
        count,
        color: visibleCount > 0 ? levels[Math.min(Math.max(1, level), levels.length - 1)] : 'transparent',
      };
    });

    const months = copy.months.map((label, month) => {
      const first = new Date(year, month, 1);
      const daysFromStart = Math.floor((first.getTime() - gridStart.getTime()) / 86400000);
      const weekColumn = Math.floor(daysFromStart / rows);
      return {
        label,
        left: `${Math.min(100, Math.max(0, ((weekColumn + 1) / (columns - 1)) * 100))}%`,
      };
    });

    return { cells: heatmapCells, monthLabels: months };
  }, [copy.months, memories, levels]);

  return (
    <div className="echo-heatmap-mini mx-auto w-[90%] pb-1">
      <div className="echo-heatmap-legend flex items-center justify-end gap-1 text-[12px] text-[#8f8068]" style={{ fontFamily: COMFORTAA_FONT }}>
        <span>{copy.less}</span>
        <span className="flex items-center gap-0" aria-hidden>
          {levels.map((color, index) => (
            <span
              key={`${color}-${index}`}
              className="h-[8px] w-[8px]"
              style={{
                background: color,
                borderLeft: index === 0 ? '1px solid #d7c9ad' : 'none',
                borderTop: '1px solid #d7c9ad',
                borderBottom: '1px solid #d7c9ad',
                borderRight: '1px solid #d7c9ad',
              }}
            />
          ))}
        </span>
        <span>{copy.more}</span>
      </div>
      <div className="echo-heatmap-months relative px-1 text-[#8f8068]" style={{ fontFamily: COMFORTAA_FONT }}>
        {monthLabels.map((month) => (
          <span key={month.label} className="absolute top-0 -translate-x-1/2" style={{ left: month.left }}>
            {month.label}
          </span>
        ))}
      </div>
      <div
        className="echo-heatmap-grid grid gap-0"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {cells.map((cell) => {
          return (
            <span
              key={cell.id}
              className="aspect-square"
              style={{
                gridColumn: cell.col + 1,
                gridRow: cell.row + 1,
                background: cell.color,
                borderTop: cell.row === 0 ? 'none' : '1px solid #e1d5bc',
                borderLeft: cell.col === 0 ? 'none' : '1px solid #e1d5bc',
                opacity: cell.inYear ? 1 : 0.35,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function GalleryPage({ memories }: { memories: MobileMemory[] }) {
  const copy = useMobileCopy();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [galleryOpenM03, setGalleryOpenM03] = useState(false);
  const [galleryOpenM04, setGalleryOpenM04] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [galleryPage, setGalleryPage] = useState(1);
  const filteredMemories = useMemo(
    () => filterMobileMemories(memories.filter((memory) => !memory.deleted), filterQuery),
    [memories, filterQuery],
  );
  const galleryPagination = useMemo(
    () => paginateGalleryItems(filteredMemories, galleryPage),
    [filteredMemories, galleryPage],
  );
  const selectedMemory = filteredMemories.find((memory) => memory.id === selectedId) ?? memories.find((memory) => memory.id === selectedId) ?? null;

  useEffect(() => {
    setGalleryPage(1);
    setSelectedId(null);
    setGalleryOpenM03(false);
    setGalleryOpenM04(false);
  }, [filterQuery]);

  useEffect(() => {
    setGalleryPage((page) => clampGalleryPage(page, filteredMemories.length));
  }, [filteredMemories.length]);

  const selectMemory = useCallback((memory: MobileMemory) => {
    setSelectedId(memory.id);
    setGalleryOpenM03(true);
    setGalleryOpenM04(false);
  }, []);

  const changeGalleryPage = useCallback((page: number) => {
    setGalleryPage(clampGalleryPage(page, filteredMemories.length));
    setSelectedId(null);
    setGalleryOpenM03(false);
    setGalleryOpenM04(false);
  }, [filteredMemories.length]);

  return (
    <section className="mobile-screen mobile-gallery-screen relative flex h-[100dvh] flex-col overflow-hidden pb-16 pt-7" style={{ background: CREAM }}>
      <FilterControl value={filterQuery} onChange={setFilterQuery} />
      <GalleryGrid memories={galleryPagination.pageItems} selectedId={selectedId} onSelect={selectMemory} />
      <div
        className="echo-gallery-pagination text-center text-[12px] tracking-[0.18em]"
        role="navigation"
        aria-label="Gallery pages"
        style={{ color: '#6c655a', fontFamily: MONO_FONT }}
      >
        <button
          type="button"
          className="echo-gallery-page-button echo-gallery-page-edge"
          aria-disabled={galleryPagination.currentPage === 1}
          onClick={() => changeGalleryPage(galleryPagination.currentPage - 1)}
        >
          {copy.prev}
        </button>
        {Array.from({ length: galleryPagination.pageCount }, (_, index) => index + 1).map((page) => (
          <button
            key={page}
            type="button"
            className={`echo-gallery-page-button ${page === galleryPagination.currentPage ? 'echo-gallery-page-button-active' : ''}`}
            aria-current={page === galleryPagination.currentPage ? 'page' : undefined}
            onClick={() => changeGalleryPage(page)}
          >
            {page}
          </button>
        ))}
        <button
          type="button"
          className="echo-gallery-page-button echo-gallery-page-edge"
          aria-disabled={galleryPagination.currentPage === galleryPagination.pageCount}
          onClick={() => changeGalleryPage(galleryPagination.currentPage + 1)}
        >
          {copy.next}
        </button>
      </div>
      <div className="echo-gallery-heatmap-block">
        <div className="mobile-heatmap-divider" aria-hidden />
        <p className="echo-heatmap-title text-center text-[15px]" style={{ color: '#6c655a', fontFamily: COMFORTAA_FONT }}>{copy.trackActivities}</p>
        <HeatmapMini memories={memories} />
      </div>
      <GalleryDetailModals
        key={selectedId === null ? 'mobile-gallery-detail-closed' : `mobile-gallery-detail-${selectedId}`}
        openM03={galleryOpenM03}
        openM04={galleryOpenM04}
        photos={selectedMemory?.photos ?? []}
        audioEntries={selectedMemory?.audioEntries ?? []}
        log={selectedMemory ? logFromMemory(selectedMemory) : logFromMemory(seedMemories[0])}
        onGoToMemories={() => {
          setGalleryOpenM04(true);
          setGalleryOpenM03(false);
        }}
        onBackToGalleryFromM03={() => {
          setGalleryOpenM03(false);
          setSelectedId(null);
        }}
        onBackToDiary={() => {
          setGalleryOpenM04(false);
          setGalleryOpenM03(true);
        }}
        onBackToGalleryFromM04={() => {
          setGalleryOpenM04(false);
          setGalleryOpenM03(false);
          setSelectedId(null);
        }}
      />
    </section>
  );
}

function SettingPage({
  memories,
  onClose,
  selectedModel,
  onModelChange,
  imageProviderAvailability,
}: {
  memories: MobileMemory[];
  onClose: () => void;
  selectedModel: MobileModelId;
  onModelChange: (model: MobileModelId) => void;
  imageProviderAvailability: ImageProviderAvailability | null;
}) {
  const { user, session, signOut } = useAuth();
  const { language, toggleLanguage } = useLocalization();
  const { styles, update, create, remove } = useBuildingStyles();
  const accountEmail = user?.email?.trim() ?? '';
  const accountPhone = user?.phone?.trim()
    || metadataString(user?.user_metadata?.phone)
    || metadataString(user?.user_metadata?.phone_number);
  const profileIdentifier = user?.id || accountEmail || accountPhone || 'authenticated-user';
  const copy = MOBILE_COPY[language];
  const profileStorageKey = `echomap-mobile-profile-${profileIdentifier}`;
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const photoPermissionInputRef = useRef<HTMLInputElement | null>(null);
  const filePermissionInputRef = useRef<HTMLInputElement | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [controlsModalOpen, setControlsModalOpen] = useState(false);
  const [versionPlanModalOpen, setVersionPlanModalOpen] = useState(false);
  const [generationBalance, setGenerationBalance] = useState<MobileGenerationBalance | null>(null);
  const [permissionHint, setPermissionHint] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [subview, setSubview] = useState<SettingSubview>('main');
  const [editingStyle, setEditingStyle] = useState<BuildingStyleDefinition | null>(null);
  const [creatingStyle, setCreatingStyle] = useState(false);
  const [accountName, setAccountName] = useState(() => {
    if (typeof window === 'undefined') return defaultAccountName(profileIdentifier);
    return window.localStorage.getItem(`${profileStorageKey}:name`) || defaultAccountName(profileIdentifier);
  });
  const [draftAccountName, setDraftAccountName] = useState(accountName);
  const [editingProfileField, setEditingProfileField] = useState<ProfileEditField | null>(null);
  const [profilePhone, setProfilePhone] = useState(() => {
    if (typeof window === 'undefined') return accountPhone;
    return window.localStorage.getItem(`${profileStorageKey}:phone`) ?? accountPhone;
  });
  const [draftPhone, setDraftPhone] = useState(profilePhone);
  const [profileEmail, setProfileEmail] = useState(() => {
    if (typeof window === 'undefined') return accountEmail;
    return window.localStorage.getItem(`${profileStorageKey}:email`) ?? accountEmail;
  });
  const [draftEmail, setDraftEmail] = useState(profileEmail);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(`${profileStorageKey}:avatar`);
  });
  const refreshGenerationBalance = useCallback(async () => {
    if (!user || !session?.access_token) {
      setGenerationBalance(null);
      return null;
    }
    try {
      const response = await fetch(apiUrl('/api/generation-quota'), {
        method: 'GET',
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      const data = (await response.json().catch(() => ({}))) as {
        balance?: MobileGenerationBalance;
      };
      if (!data.balance) return null;
      setGenerationBalance(data.balance);
      return data.balance;
    } catch {
      return null;
    }
  }, [session?.access_token, user]);
  useEffect(() => {
    void refreshGenerationBalance();
  }, [refreshGenerationBalance]);
  useEffect(() => {
    const refreshWhenActive = () => {
      if (document.visibilityState === 'visible') void refreshGenerationBalance();
    };
    window.addEventListener('focus', refreshWhenActive);
    window.addEventListener('echomap:generation-completed', refreshWhenActive);
    document.addEventListener('visibilitychange', refreshWhenActive);
    return () => {
      window.removeEventListener('focus', refreshWhenActive);
      window.removeEventListener('echomap:generation-completed', refreshWhenActive);
      document.removeEventListener('visibilitychange', refreshWhenActive);
    };
  }, [refreshGenerationBalance]);
  const filteredMemories = useMemo(
    () => filterMobileMemories(memories.filter((memory) => !memory.deleted), filterQuery),
    [memories, filterQuery],
  );
  const languageLabel = language === 'en' ? 'English' : '中文';
  const maskedPhone = maskPhoneNumber(profilePhone);
  const permissionRows = useMemo(
    () => [
      { kind: 'notifications' as const, label: copy.notifications, icon: <IconBell size={22} /> },
      { kind: 'camera' as const, label: copy.camera, icon: <IconCameraOnly size={22} /> },
      { kind: 'photos' as const, label: copy.photos, icon: <IconImage size={22} /> },
      { kind: 'microphone' as const, label: copy.microphone, icon: <IconMic size={22} /> },
      { kind: 'files' as const, label: copy.files, icon: <IconFileDoc size={22} /> },
      { kind: 'bluetooth' as const, label: copy.bluetooth, icon: <IconBluetooth size={22} /> },
    ],
    [copy],
  );
  const sheetTitle = subview === 'account' ? copy.editProfile : subview === 'privacy' ? copy.privacyTitle : subview === 'styles' ? '生图风格' : copy.settings;

  const handleMobileLogout = useCallback(async () => {
    try {
      await signOut();
    } finally {
      onClose();
    }
  }, [onClose, signOut]);

  useEffect(() => {
    setDraftAccountName(accountName);
  }, [accountName]);

  useEffect(() => {
    setDraftPhone(profilePhone);
  }, [profilePhone]);

  useEffect(() => {
    setDraftEmail(profileEmail);
  }, [profileEmail]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(`${profileStorageKey}:name`, accountName);
  }, [accountName, profileStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(`${profileStorageKey}:phone`, profilePhone);
  }, [profilePhone, profileStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(`${profileStorageKey}:email`, profileEmail);
  }, [profileEmail, profileStorageKey]);

  const saveAccountName = useCallback(() => {
    const next = draftAccountName.trim() || defaultAccountName(profileIdentifier);
    setAccountName(next);
    setDraftAccountName(next);
    setEditingProfileField(null);
  }, [draftAccountName, profileIdentifier]);

  const saveProfilePhone = useCallback(() => {
    const next = draftPhone.trim();
    setProfilePhone(next);
    setDraftPhone(next);
    setEditingProfileField(null);
  }, [draftPhone]);

  const saveProfileEmail = useCallback(() => {
    const next = draftEmail.trim();
    setProfileEmail(next);
    setDraftEmail(next);
    setEditingProfileField(null);
  }, [draftEmail]);

  const updateAvatar = useCallback((file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : null;
      if (!value) return;
      setAvatarSrc(value);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(`${profileStorageKey}:avatar`, value);
      }
    };
    reader.readAsDataURL(file);
  }, [profileStorageKey]);

  const showPermissionHint = useCallback((message: string) => {
    setPermissionHint(message);
    window.setTimeout(() => setPermissionHint(null), 2200);
  }, []);

  const requestMobilePermission = useCallback(async (kind: PermissionKind) => {
    try {
      if (kind === 'notifications') {
        if (!('Notification' in window) || typeof Notification.requestPermission !== 'function') {
          showPermissionHint(copy.permissionUnsupported);
          return;
        }
        const result = await Notification.requestPermission();
        showPermissionHint(result === 'granted' ? copy.permissionGranted : copy.permissionDenied);
        return;
      }

      if (kind === 'camera' || kind === 'microphone') {
        const mediaDevices = navigator.mediaDevices;
        if (!mediaDevices?.getUserMedia) {
          showPermissionHint(copy.permissionUnsupported);
          return;
        }
        const stream = await mediaDevices.getUserMedia({
          video: kind === 'camera',
          audio: kind === 'microphone',
        });
        stream.getTracks().forEach((track) => track.stop());
        showPermissionHint(copy.permissionGranted);
        return;
      }

      if (kind === 'photos') {
        photoPermissionInputRef.current?.click();
        showPermissionHint(copy.permissionPickPhoto);
        return;
      }

      if (kind === 'files') {
        filePermissionInputRef.current?.click();
        showPermissionHint(copy.permissionPickFile);
        return;
      }

      if (kind === 'bluetooth') {
        // Web Bluetooth opens a browser-owned device chooser that is unstable in the embedded mobile preview.
        showPermissionHint(copy.permissionUnsupported);
        return;
      }
    } catch {
      showPermissionHint(copy.permissionDenied);
    }
  }, [copy, showPermissionHint]);

  return (
    <section className="echo-settings-page mobile-gallery-screen relative flex h-[100dvh] flex-col overflow-hidden pb-16 pt-7" style={{ background: CREAM }}>
      <FilterControl value={filterQuery} onChange={setFilterQuery} />
      <GalleryGrid memories={filteredMemories} />
      <button
        type="button"
        className="echo-settings-scrim fixed inset-0 z-[60] border-0 p-0"
        aria-label={copy.closeSettings}
        onClick={onClose}
      />
      <div className={`echo-settings-sheet fixed inset-x-0 bottom-0 z-[70] px-7 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-4 ${subview !== 'main' ? 'echo-settings-subpage' : ''}`}>
        {subview === 'main' ? (
          <button
            type="button"
            className="echo-settings-handle-button mx-auto flex items-center justify-center border-0 bg-transparent p-0"
            onClick={onClose}
            aria-label={copy.collapseSettings}
          >
            <span className="echo-settings-handle" aria-hidden />
          </button>
        ) : null}
        {subview === 'main' ? (
          <button
            type="button"
            className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full border-0 bg-white p-0 text-[#5f5f5f] transition-transform active:scale-95"
            onClick={onClose}
            aria-label={copy.closeSettings}
          >
            <IconClose size={23} />
          </button>
        ) : (
          <button
            type="button"
            className="absolute left-5 top-7 flex h-9 w-9 items-center justify-center border-0 bg-transparent p-0 text-[#222] transition-transform active:scale-95"
            onClick={() => setSubview('main')}
            aria-label={copy.backToSettings}
          >
            <span className="rotate-180">
              <IconChevronRight size={27} />
            </span>
          </button>
        )}
        <h2 className={`m-0 text-center text-[22px] font-bold tracking-[0.03em] ${subview === 'main' ? 'mt-5' : 'mt-4'}`} style={{ color: '#5f5f5f', fontFamily: MONO_FONT }}>
          {sheetTitle}
        </h2>

        {subview === 'styles' ? (
          <div className="mt-8 space-y-3" style={{ fontFamily: MONO_FONT }}>
            {styles.map((style) => (
              <button
                key={style.id}
                type="button"
                className="echo-setting-row"
                onClick={() => {
                  setCreatingStyle(false);
                  setEditingStyle(style);
                }}
              >
                <span className="h-2.5 w-2.5 rounded-full bg-current" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-left text-[14px] font-bold text-current">{style.name}</span>
                <span className="text-[#8a8a8a]"><IconChevronRight size={21} /></span>
              </button>
            ))}
            <button
              type="button"
              className="echo-setting-row"
              onClick={() => {
                setEditingStyle({
                  id: `custom-${Date.now()}`,
                  name: 'Custom style',
                  prompt: styles.find((style) => style.id === DEFAULT_BUILDING_STYLE)?.prompt || '',
                  builtin: false,
                });
                setCreatingStyle(true);
              }}
            >
              <span className="h-2.5 w-2.5 rounded-full border border-current" aria-hidden />
              <span className="min-w-0 flex-1 text-left text-[14px] font-bold text-current">新建自定义风格</span>
              <span className="text-[#8a8a8a]"><IconChevronRight size={21} /></span>
            </button>
          </div>
        ) : subview === 'account' ? (
          <div className="mt-16">
            <div className="relative mx-auto h-[76px] w-[76px]">
              <div className="echo-settings-avatar echo-profile-avatar flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-white text-black">
                {avatarSrc ? (
                  <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
                ) : (
                  <IconAccount size={44} />
                )}
              </div>
              <button
                type="button"
                className="absolute bottom-[-2px] right-[-4px] flex h-9 w-9 items-center justify-center rounded-full border-0 bg-white p-0 text-[#333] shadow-[0_8px_20px_rgba(0,0,0,0.08)]"
                aria-label={copy.changeAvatar}
                onClick={() => avatarInputRef.current?.click()}
              >
                <IconCameraOnly size={21} />
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  updateAvatar(event.target.files?.[0] ?? null);
                  event.currentTarget.value = '';
                }}
              />
            </div>
            <div className="echo-profile-card mt-10 overflow-hidden rounded-[18px] bg-white">
              <div className="echo-profile-row">
                <span className="echo-profile-label">{copy.name}</span>
                {editingProfileField === 'name' ? (
                  <input
                    className="min-w-0 flex-1 border-0 bg-transparent text-right text-[#555] outline-none"
                    value={draftAccountName}
                    autoFocus
                    onChange={(event) => setDraftAccountName(event.target.value)}
                    onBlur={saveAccountName}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') saveAccountName();
                      if (event.key === 'Escape') {
                        setDraftAccountName(accountName);
                        setEditingProfileField(null);
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center justify-end gap-2 border-0 bg-transparent p-0 text-right text-[#9a9a9a]"
                    aria-label={copy.editName}
                    onClick={() => setEditingProfileField('name')}
                  >
                    <span className="min-w-0 truncate">{accountName}</span>
                    <IconChevronRight size={22} />
                  </button>
                )}
              </div>
              <div className="echo-profile-divider" aria-hidden />
              <div className="echo-profile-row">
                <span className="echo-profile-label">{copy.phone}</span>
                {editingProfileField === 'phone' ? (
                  <input
                    className="min-w-0 flex-1 border-0 bg-transparent text-right text-[#555] outline-none"
                    type="tel"
                    value={draftPhone}
                    autoFocus
                    onChange={(event) => setDraftPhone(event.target.value)}
                    onBlur={saveProfilePhone}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') saveProfilePhone();
                      if (event.key === 'Escape') {
                        setDraftPhone(profilePhone);
                        setEditingProfileField(null);
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center justify-end gap-2 border-0 bg-transparent p-0 text-right text-[#9a9a9a]"
                    aria-label={copy.editPhone}
                    onClick={() => setEditingProfileField('phone')}
                  >
                    <span className="min-w-0 truncate">{maskedPhone}</span>
                    <IconChevronRight size={22} />
                  </button>
                )}
              </div>
              <div className="echo-profile-divider" aria-hidden />
              <div className="echo-profile-row">
                <span className="echo-profile-label">{copy.email}</span>
                {editingProfileField === 'email' ? (
                  <input
                    className="min-w-0 flex-1 border-0 bg-transparent text-right text-[#555] outline-none"
                    type="email"
                    value={draftEmail}
                    autoFocus
                    onChange={(event) => setDraftEmail(event.target.value)}
                    onBlur={saveProfileEmail}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') saveProfileEmail();
                      if (event.key === 'Escape') {
                        setDraftEmail(profileEmail);
                        setEditingProfileField(null);
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center justify-end gap-2 border-0 bg-transparent p-0 text-right text-[#9a9a9a]"
                    aria-label={copy.editEmail}
                    onClick={() => setEditingProfileField('email')}
                  >
                    <span className="min-w-0 truncate">{profileEmail}</span>
                    <IconChevronRight size={22} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : subview === 'privacy' ? (
          <div className="mt-10">
            <div className="echo-permission-card overflow-hidden rounded-[18px] bg-white">
              {permissionRows.map((row, index) => (
                <button
                  key={row.kind}
                  type="button"
                  className="echo-permission-row"
                  aria-label={row.label}
                  onClick={() => void requestMobilePermission(row.kind)}
                >
                  <span className="echo-permission-icon">{row.icon}</span>
                  <span className="min-w-0 flex-1 text-left font-bold text-[#666]">{row.label}</span>
                  <span className="text-[#9d9d9d]"><IconChevronRight size={22} /></span>
                  {index < permissionRows.length - 1 && <span className="echo-permission-divider" aria-hidden />}
                </button>
              ))}
            </div>
            <input
              ref={photoPermissionInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                event.currentTarget.value = '';
              }}
            />
            <input
              ref={filePermissionInputRef}
              type="file"
              className="hidden"
              onChange={(event) => {
                event.currentTarget.value = '';
              }}
            />
            {permissionHint && (
              <p className="m-0 mt-3 text-center text-[14px] font-bold tracking-[0.02em] text-[#777]" style={{ fontFamily: MONO_FONT }}>
                {permissionHint}
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="mt-6 flex flex-col items-center">
              <div
                className="echo-settings-avatar flex h-[76px] w-[76px] items-center justify-center overflow-hidden rounded-full bg-white text-black"
                style={{ fontFamily: MONO_FONT, fontWeight: 400 }}
              >
                {avatarSrc ? (
                  <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
                ) : (
                  <IconAccount size={44} />
                )}
              </div>
            </div>

            <div className="mt-8 space-y-3" style={{ fontFamily: MONO_FONT }}>
              <button type="button" className="echo-setting-row" aria-label={copy.accountSettings} onClick={() => setSubview('account')}>
                <span className="echo-setting-icon echo-setting-icon-pure"><IconAccount size={22} /></span>
                <span className="min-w-0 flex-1 text-left text-[14px] font-bold tracking-[0.02em] text-[#666]">{copy.account}</span>
                <span className="text-[#8a8a8a]"><IconChevronRight size={21} /></span>
              </button>

              <button type="button" className="echo-setting-row" aria-label="生图风格" onClick={() => setSubview('styles')}>
                <span className="echo-setting-icon echo-setting-icon-pure"><EchoSparklesIcon strokeWidth={1.5} /></span>
                <span className="min-w-0 flex-1 text-left text-[14px] font-bold tracking-[0.02em] text-[#666]">生图风格</span>
                <span className="text-[#8a8a8a]"><IconChevronRight size={21} /></span>
              </button>

              <div className="overflow-visible rounded-[16px] bg-white shadow-[0_1px_0_rgba(0,0,0,0.03)]">
                <button type="button" className="echo-setting-row rounded-b-none shadow-none" onClick={toggleLanguage} aria-label={copy.language}>
                  <span className="echo-setting-icon echo-setting-icon-pure"><IconLanguage size={22} /></span>
                  <span className="min-w-0 flex-1 text-left text-[14px] font-bold tracking-[0.02em] text-[#666]">{copy.language}</span>
                  <span className="text-[14px] font-bold tracking-[0.02em] text-[#777]">{languageLabel}</span>
                  <span className="text-[#777]"><IconChevronDown size={13} /></span>
                </button>
                <div className="mx-3 h-px bg-[#eeeeec]" aria-hidden />
                <div className="relative">
                  <button
                    type="button"
                    className="echo-setting-row rounded-t-none shadow-none"
                    onClick={() => setModelMenuOpen((open) => !open)}
                    aria-label={copy.chooseModel}
                    aria-expanded={modelMenuOpen}
                  >
                    <span className="echo-setting-icon echo-setting-icon-pure"><EchoSparklesIcon strokeWidth={1.5} /></span>
                    <span className="min-w-0 flex-1 text-left text-[14px] font-bold tracking-[0.02em] text-[#666]">{copy.model}</span>
                    <span className="flex h-6 w-6 items-center justify-center">
                      <MobileModelIcon model={selectedModel} size={24} />
                    </span>
                    <span className="text-[#777]"><IconChevronDown size={13} /></span>
                  </button>
                  {modelMenuOpen && (
                    <div
                      className="absolute right-0 top-[calc(100%+0.35rem)] z-50 w-[280px] max-w-[calc(100vw-2rem)] rounded-[8px] border border-black/10 bg-white px-1.5 py-1.5 shadow-[0_6px_16px_rgba(0,0,0,0.12)]"
                      style={{ fontFamily: MONO_FONT }}
                    >
                      {MOBILE_MODEL_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          disabled={
                            imageProviderAvailability?.[
                              option.id
                            ] === false
                          }
                          className="flex min-h-[44px] w-full items-center gap-3 rounded-[6px] border-0 bg-transparent px-3 py-2 text-left text-[14px] font-bold tracking-[0.02em] hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
                          style={{ color: '#666' }}
                          onClick={() => {
                            onModelChange(option.id);
                            setModelMenuOpen(false);
                          }}
                        >
                          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center">
                            <MobileModelIcon model={option.id} size={22} />
                          </span>
                          <span className="min-w-0 flex-1 truncate">{option.label}</span>
                          {imageProviderAvailability?.[
                            option.id
                          ] === false && (
                            <span className="max-w-[78px] shrink-0 text-right text-[10px] font-normal leading-tight whitespace-normal">
                              {copy.providerNotConfigured}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <button type="button" className="echo-setting-row" aria-label={copy.controls} onClick={() => setControlsModalOpen(true)}>
                <span className="echo-setting-icon echo-setting-icon-pure"><span className="text-[17px] font-bold leading-none">?</span></span>
                <span className="min-w-0 flex-1 text-left text-[14px] font-bold tracking-[0.02em] text-[#666]">{copy.controls}</span>
                <span className="text-[#8a8a8a]"><IconChevronRight size={21} /></span>
              </button>

              <button type="button" className="echo-setting-row" aria-label={copy.versionPlan} onClick={() => {
                void refreshGenerationBalance();
                setVersionPlanModalOpen(true);
              }}>
                <span className="echo-setting-icon echo-setting-icon-pure"><IconVersionPlan size={22} /></span>
                <span className="min-w-0 flex-1 text-left text-[14px] font-bold tracking-[0.02em] text-[#666]">{copy.versionPlan}</span>
                <span className="shrink-0 text-[13px] font-bold tracking-[0.01em] text-[#777]">
                  {generationBalance?.remainingGenerations ?? '—'}
                </span>
                <span className="text-[#8a8a8a]"><IconChevronRight size={21} /></span>
              </button>

              <button type="button" className="echo-setting-row" aria-label={copy.permissionPrivacyLabel} onClick={() => setSubview('privacy')}>
                <span className="echo-setting-icon echo-setting-icon-pure"><IconShield size={22} /></span>
                <span className="min-w-0 flex-1 text-left text-[14px] font-bold tracking-[0.02em] text-[#666]">{copy.permissionPrivacy}</span>
                <span className="text-[#8a8a8a]"><IconChevronRight size={21} /></span>
              </button>

              <button
                type="button"
                data-mobile-action="logout"
                onClick={() => void handleMobileLogout()}
                className="echo-setting-row"
                aria-label={copy.logout}
              >
                <span className="echo-setting-icon echo-setting-icon-pure"><IconLogout size={22} /></span>
                <span className="min-w-0 flex-1 text-left text-[14px] font-bold tracking-[0.02em] text-[#666]">{copy.logout}</span>
              </button>
            </div>
          </>
        )}
      </div>
      {controlsModalOpen && (
        <div className="fixed inset-0 z-[90]">
          <HelpModal onClose={() => setControlsModalOpen(false)} />
        </div>
      )}
      {versionPlanModalOpen && (
        <div className="fixed inset-0 z-[90]">
          <VersionPlanModal title={copy.versionPlan} onClose={() => setVersionPlanModalOpen(false)} />
        </div>
      )}
      <BuildingStyleEditorModal
        open={Boolean(editingStyle)}
        style={editingStyle}
        onCancel={() => {
          setEditingStyle(null);
          setCreatingStyle(false);
        }}
        onSave={(name, prompt) => {
          if (!editingStyle) return;
          if (creatingStyle) {
            create(name, prompt);
          } else {
            update({ ...editingStyle, name, prompt });
          }
          setEditingStyle(null);
          setCreatingStyle(false);
        }}
        onDelete={() => {
          if (!editingStyle || creatingStyle) return;
          if (window.confirm('删除这个自定义风格？')) {
            remove(editingStyle.id);
            setEditingStyle(null);
          }
        }}
      />
    </section>
  );
}

function AuthenticatedMobileShell() {
  const { loading, user } = useAuth();
  const userId = user?.id;
  const { language } = useLocalization();

  const [activeTab, setActiveTab] = useState<MobileTab>('home');
  const [mountedTabs, setMountedTabs] = useState<Set<MobileTab>>(() => new Set<MobileTab>(['home', 'gallery', 'setting']));
  const [mapShouldMount, setMapShouldMount] = useState(false);
  const [memories, setMemories] = useState<MobileMemory[]>(() => restoredMobileMemoriesWithSeeds());
  const [cloudStatus, setCloudStatus] = useState<'idle' | 'loading' | 'ready'>('idle');
  const [cloudSyncSlow, setCloudSyncSlow] = useState(false);
  const [cloudLoadError, setCloudLoadError] = useState(false);
  const [showAddBuildingModal, setShowAddBuildingModal] = useState(false);
  const [pendingMapPlacement, setPendingMapPlacement] = useState<MobileMapPlacement | null>(null);
  const [mapPlacementNotice, setMapPlacementNotice] = useState<MapPlacementNotice | null>(null);
  const [mapTextNotice, setMapTextNotice] = useState<MapTextNotice | null>(null);
  const [mapFocusMemoryId, setMapFocusMemoryId] = useState<number | null>(null);
  const [selectedModel, setSelectedModel] = useState<MobileModelId>(() => readStoredMobileModel());
  const [imageProviderAvailability, setImageProviderAvailability] = useState<ImageProviderAvailability | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const cloudLoadedUserRef = useRef<string | null>(null);
  const nextCloudIdRef = useRef(1000);

  useEffect(() => {
    let cancelled = false;
    void fetchImageProviderAvailability().then((availability) => {
      if (!cancelled && availability) setImageProviderAvailability(availability);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!imageProviderAvailability) return;
    const selectedProvider = selectedModel;
    if (imageProviderAvailability[selectedProvider] !== false) return;
    const fallback = (['gemini', 'jimeng'] as const).find(
      (model) => imageProviderAvailability[model] === true
    );
    if (fallback) setSelectedModel(fallback);
  }, [imageProviderAvailability, selectedModel]);

  const createMobileBuilding = useCallback(async (
    file: File | null,
    buildingName: string,
    buildingStyle: BuildingStyleId,
    stylePrompt: string,
    placement: MobileMapPlacement | null,
  ) => {
    if (!file) return;
    const sizeCheck = assertFileSizeOk(file);
    if (!sizeCheck.ok) return;

    const name = buildingName.trim() || file.name.replace(/\.[^.]+$/, '') || 'New memory';
    try {
      await checkGenerationQuota();
    } catch (error) {
      const message = mobileGenerationErrorMessage(error, MOBILE_COPY[language].generationFailed, language);
      setActiveTab('map');
      setMapTextNotice({ id: Date.now(), text: message });
      return;
    }

    const id = Date.now();
    const previewUrl = URL.createObjectURL(file);
    objectUrlsRef.current.add(previewUrl);
    const initialDate = isoDateKey();
    const initialLocation = placement?.location || name || 'Creating';
    const photo: PhotoData = {
      file,
      url: previewUrl,
      photo_id: photoIdFor(id),
      createdAt: `${initialDate}T12:00:00`,
    };
    const baseMemory: MobileMemory = {
      id,
      place: name,
      date: initialDate.replace(/-/g, '.'),
      region: initialLocation,
      imageSrc: '',
      lat: placement?.lat,
      lng: placement?.lng,
      photos: [photo],
      audioEntries: [],
      buildingStyle,
      stylePrompt,
      isGenerating: true,
      generationError: undefined,
      defaultUnlocked: true,
      log: {
        location: initialLocation,
        buildingName: name,
        date: initialDate,
        partner: '',
        moon: '',
        musings: '',
        avatarVariant: 0,
        landmark_id: id,
      },
    };

    setMemories((current) => [
      baseMemory,
      ...current,
    ]);
    setActiveTab('map');
    setMapFocusMemoryId(id);
    setMapPlacementNotice(null);

    void resolveMobileBuildingPlacement(file, name, language, placement)
      .then((resolved) => {
        setMemories((current) =>
          current.map((memory) => {
            if (memory.id !== id) return memory;
            const displayDate = resolved.date.replace(/-/g, '.');
            return {
              ...memory,
              date: displayDate,
              region: resolved.location,
              lat: resolved.lat,
              lng: resolved.lng,
              photos: memory.photos?.map((item) =>
                item.photo_id === photo.photo_id
                  ? { ...item, createdAt: `${resolved.date}T12:00:00` }
                  : item
              ),
              log: {
                ...memory.log,
                location: resolved.location,
                date: resolved.date,
              },
            };
          })
        );
        setMapPlacementNotice({ id: Date.now(), location: resolved.location });
      })
      .catch((error) => console.error('Mobile building placement update failed', error));

    void ensureMobileAudioContext()
      .then(() => mobileSynth.triggerAttackRelease('C4', '8n'))
      .catch((error) => console.warn('mobile add-building audio skipped', error));

    try {
      const preferredModel = preferredImageModelFromMobileModel(selectedModel);
      console.info('Mobile building generation started', { preferredModel, buildingStyle, buildingName: name });
      const { imageUrl } = await generateImageWithPrompt(file, { buildingName: name, buildingStyle, stylePrompt, preferredModel });
      if (!imageUrl) throw new Error('Generation failed, no image returned.');
      const processed = await processMobileImageForTransparency(imageUrl);
      setMemories((current) =>
        current.map((memory) =>
          memory.id === id
            ? { ...memory, imageSrc: processed.src, isGenerating: false, generationError: undefined }
            : memory
        )
      );
      void ensureMobileAudioContext()
        .then(() => mobileSynth.triggerAttackRelease('G4', '8n'))
        .catch((error) => console.warn('mobile generation audio skipped', error));
    } catch (error) {
      console.error('Mobile building generation failed', error);
      const message = mobileGenerationErrorMessage(error, MOBILE_COPY[language].generationFailed, language);
      setMapTextNotice({ id: Date.now(), text: message });
      setMemories((current) =>
        current.filter((memory) => memory.id !== id)
      );
      void ensureMobileAudioContext()
        .then(() => mobileSynth.triggerAttackRelease('A3', '8n'))
        .catch(() => {});
    }
  }, [language, selectedModel]);

  const regenerateMobileMemory = useCallback(async (memory: MobileMemory, userPrompt?: string) => {
    const photo = latestMobilePhoto(memory.photos);
    if (!photo?.file) {
      throw new Error('No source photo found for this building.');
    }
    const preferredModel = preferredImageModelFromMobileModel(selectedModel);
    const buildingStyle = memory.buildingStyle ?? DEFAULT_BUILDING_STYLE;
    const buildingName = memory.log?.buildingName || memory.place;
    await checkGenerationQuota();
    console.info('Mobile building regeneration started', {
      preferredModel,
      buildingStyle,
      buildingName,
      mode: userPrompt?.trim() ? 'edit' : 'regenerate',
    });
    setMemories((current) =>
      current.map((item) =>
        item.id === memory.id
          ? { ...item, isGenerating: true, generationError: undefined }
          : item
      )
    );
    try {
      const { imageUrl } = await generateImageWithPrompt(photo.file, {
        buildingName,
        buildingStyle,
        stylePrompt: memory.stylePrompt,
        preferredModel,
        userPrompt: userPrompt?.trim() || undefined,
      });
      if (!imageUrl) throw new Error('Generation failed, no image returned.');
      const processed = await processMobileImageForTransparency(imageUrl);
      setMemories((current) =>
        current.map((item) =>
          item.id === memory.id
            ? { ...item, imageSrc: processed.src, buildingStyle, isGenerating: false, generationError: undefined }
            : item
        )
      );
    } catch (error) {
      const message = mobileGenerationErrorMessage(error, MOBILE_COPY[language].generationFailed, language);
      setMemories((current) =>
        current.map((item) =>
          item.id === memory.id
            ? { ...item, isGenerating: false, generationError: undefined }
            : item
        )
      );
      throw error;
    }
  }, [language, selectedModel]);

  const updateMobileMemoryPlacement = useCallback((memoryToUpdate: MobileMemory, placement: MobileMapPlacement) => {
    const fallbackLocation = placement.location || memoryToUpdate.region || memoryToUpdate.place;
    const applyPlacement = (location: string) => {
      setMemories((current) =>
        current.map((memory) => {
          if (memory.id !== memoryToUpdate.id) return memory;
          return {
            ...memory,
            lat: placement.lat,
            lng: placement.lng,
            region: location,
            log: {
              ...logFromMemory(memory),
              location,
            },
          };
        })
      );
    };

    applyPlacement(fallbackLocation);
    void resolveMobileMapPlacementLocation(placement.lat, placement.lng, language, fallbackLocation)
      .then((location) => {
        if (location) applyPlacement(location);
      })
      .catch((error) => console.error('Mobile placement location update failed', error));
  }, [language]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(MOBILE_MODEL_STORAGE_KEY, selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const deletedKeys = readDeletedMobileMemoryKeys();
    let deletedKeysChanged = false;
    memories.filter((memory) => memory.deleted).forEach((memory) => {
      mobileMemoryDeleteKeys(memory).forEach((key) => {
        if (deletedKeys.has(key)) return;
        deletedKeys.add(key);
        deletedKeysChanged = true;
      });
    });
    if (deletedKeysChanged) writeDeletedMobileMemoryKeys(deletedKeys);

    const stored = memories
      .map(mobileMemoryToStoredMemory)
      .filter((memory): memory is StoredMobileMemory => Boolean(memory));
    try {
      if (stored.length) {
        window.localStorage.setItem(MOBILE_MEMORIES_STORAGE_KEY, JSON.stringify(stored));
      } else {
        window.localStorage.removeItem(MOBILE_MEMORIES_STORAGE_KEY);
      }
    } catch (error) {
      console.warn('Failed to store mobile memories locally', error);
    }
  }, [memories]);

  const requestAddBuilding = useCallback((placement: MobileMapPlacement | null) => {
    setPendingMapPlacement(placement);
    setShowAddBuildingModal(true);
  }, []);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    setMountedTabs((current) => {
      if (current.has(activeTab)) return current;
      const next = new Set(current);
      next.add(activeTab);
      return next;
    });
    if (activeTab === 'map') setMapShouldMount(true);
  }, [activeTab]);

  useEffect(() => {
    if (!mapPlacementNotice) return;
    const timeout = window.setTimeout(() => setMapPlacementNotice(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [mapPlacementNotice]);

  useEffect(() => {
    if (loading) return;
    prewarmMapbox(deploymentConfig.mapboxAccessToken);
    const timerId = window.setTimeout(() => setMapShouldMount(true), 350);
    return () => window.clearTimeout(timerId);
  }, [loading]);

  useEffect(() => {
    if (!userId) {
      cloudLoadedUserRef.current = null;
      setCloudStatus('idle');
      setCloudSyncSlow(false);
      setCloudLoadError(false);
      setMemories(restoredMobileMemoriesWithSeeds());
      return;
    }
    if (!isSupabaseConfigured) return;
    if (cloudLoadedUserRef.current === userId) return;
    let active = true;
    cloudLoadedUserRef.current = userId;
    setCloudStatus('loading');
    setMemories(mergeMobileMemories(readStoredMobileMemories()));
    setCloudSyncSlow(false);
    setCloudLoadError(false);
    const cancelDeadline = scheduleDeadline(() => {
      if (!active) return;
      setCloudSyncSlow(true);
      setCloudStatus('ready');
    }, 15_000);
    void (async () => {
      try {
        const loaded = await loadAllCloudBuildings(() => nextCloudIdRef.current++, userId);
        if (!active) return;
        const nextMemories = loaded
          .map(mobileMemoryFromCloud)
          .filter((item): item is MobileMemory => Boolean(item));
        const realMemories = mergeMobileMemories(readStoredMobileMemories(), nextMemories);
        setMemories(realMemories);
        setCloudSyncSlow(false);
        setCloudLoadError(false);
        setCloudStatus('ready');
      } catch (error) {
        if (!active) return;
        console.error('mobile cloud load failed', error);
        setMemories(mergeMobileMemories(readStoredMobileMemories()));
        setCloudSyncSlow(false);
        setCloudLoadError(true);
        setCloudStatus('ready');
      } finally {
        cancelDeadline();
      }
    })();
    return () => {
      active = false;
      cancelDeadline();
    };
  }, [userId]);

  const deleteMobileMemory = useCallback((memoryToDelete: MobileMemory) => {
    rememberDeletedMobileMemory(memoryToDelete);
    setMemories((current) => {
      let found = false;
      const next = current.map((memory) => {
        if (memory.id !== memoryToDelete.id) return memory;
        found = true;
        return { ...memory, deleted: true };
      });
      if (found) return next;
      return [{ ...memoryToDelete, deleted: true }, ...next];
    });

    if (memoryToDelete.cloudId && user?.id) {
      void deleteBuildingFromCloud(memoryToDelete.cloudId, user.id).catch((error) => {
        console.error('mobile cloud delete failed', error);
      });
    }
  }, [user?.id]);

  const duplicateMobileMemory = useCallback((memory: MobileMemory) => {
    const nextId = Date.now();
    const duplicate: MobileMemory = {
      ...memory,
      id: nextId,
      cloudId: undefined,
      deleted: false,
      place: memory.place,
      lat: memory.lat,
      lng: memory.lng,
      defaultUnlocked: true,
      log: {
        ...logFromMemory(memory),
        landmark_id: nextId,
      },
      photos: memory.photos?.map((photo, index) => ({
        ...photo,
        photo_id: `${photo.photo_id || photoIdFor(memory.id)}-copy-${nextId}-${index}`,
      })),
    };
    setMemories((current) => [duplicate, ...current]);
    setMapFocusMemoryId(nextId);
    setActiveTab('map');
    return nextId;
  }, []);

  if (loading) {
    return (
      <div className="mobile-screen flex min-h-[100dvh] items-center justify-center" style={{ background: SKY_BLUE, color: BRAND_BLUE, fontFamily: MONO_FONT }}>
        Echo Map
      </div>
    );
  }

  return (
    <div className="mobile-shell" style={{ fontFamily: UI_FONT }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = '';
          void createMobileBuilding(file, '', DEFAULT_BUILDING_STYLE, '', pendingMapPlacement);
        }}
      />
      {mountedTabs.has('home') && (
        <div
          className={mobileTabPanelClass(activeTab === 'home')}
          aria-hidden={activeTab === 'home' ? undefined : true}
        >
          <HomePage memories={memories} />
        </div>
      )}
      {mapShouldMount && (
        <div
          className={mobileTabPanelClass(activeTab === 'map')}
          aria-hidden={activeTab === 'map' ? undefined : true}
        >
          <MapPage
            memories={memories}
            focusMemoryId={mapFocusMemoryId}
            placementNotice={mapPlacementNotice}
            textNotice={mapTextNotice}
            isActive={activeTab === 'map'}
            onRequestAdd={requestAddBuilding}
            onDeleteMemory={deleteMobileMemory}
            onDuplicateMemory={duplicateMobileMemory}
            onRegenerateMemory={regenerateMobileMemory}
            onUpdateMemoryPlacement={updateMobileMemoryPlacement}
          />
        </div>
      )}
      {mountedTabs.has('gallery') && (
        <div
          className={mobileTabPanelClass(activeTab === 'gallery')}
          aria-hidden={activeTab === 'gallery' ? undefined : true}
        >
          <GalleryPage memories={memories} />
        </div>
      )}
      {mountedTabs.has('setting') && (
        <div
          className={mobileTabPanelClass(activeTab === 'setting')}
          aria-hidden={activeTab === 'setting' ? undefined : true}
        >
          <SettingPage
            memories={memories}
            onClose={() => setActiveTab('gallery')}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            imageProviderAvailability={imageProviderAvailability}
          />
        </div>
      )}
      <AddBuildingModal
        open={showAddBuildingModal}
        onClose={() => {
          setShowAddBuildingModal(false);
          setPendingMapPlacement(null);
        }}
        onSave={(file, buildingName, buildingStyle, stylePrompt) => {
          setShowAddBuildingModal(false);
          void createMobileBuilding(file, buildingName, buildingStyle as BuildingStyleId, stylePrompt, pendingMapPlacement);
          setPendingMapPlacement(null);
        }}
      />
      {cloudStatus === 'loading' && (
        <div
          className="fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-50 -translate-x-1/2 rounded-full bg-white/90 px-4 py-2 text-[14px]"
          style={{ color: BRAND_BLUE, fontFamily: MONO_FONT }}
        >
          Syncing cloud...
        </div>
      )}
      {cloudSyncSlow && (
        <div
          role="status"
          className="fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-50 -translate-x-1/2 rounded-full bg-white/95 px-4 py-2 text-center text-[12px] shadow-sm"
          style={{ color: BRAND_BLUE, fontFamily: MONO_FONT }}
        >
          {MOBILE_COPY[language].cloudSyncSlow}
        </div>
      )}
      {cloudStatus === 'ready' && userId && !cloudSyncSlow && (cloudLoadError || memories.length === 0) && (
        <div
          role="status"
          className="fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-50 -translate-x-1/2 rounded-full bg-white/95 px-4 py-2 text-center text-[12px] shadow-sm"
          style={{ color: BRAND_BLUE, fontFamily: MONO_FONT }}
        >
          {cloudLoadError ? MOBILE_COPY[language].cloudSyncFailed : MOBILE_COPY[language].cloudEmpty}
        </div>
      )}
      {activeTab !== 'setting' && <BottomNav activeTab={activeTab} onChange={setActiveTab} />}
    </div>
  );
}

export function MobileShell() {
  const { loading, user } = useAuth();
  if (loading || !user) return <LoginScreen />;
  return <AuthenticatedMobileShell />;
}
