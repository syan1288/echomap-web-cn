import React from 'react';
import { createPortal } from 'react-dom';
import { EchoSidebarBrandIllustration } from './EchoSidebarBrandIllustration';
import { SidebarNoiseCanvas } from './SidebarNoiseCanvas';
import { useAuth } from '../context/AuthContext';
import { useLocalization } from '../context/LocalizationContext';
import { apiUrl } from '../lib/apiBase';
import { BuildingStyleEditorModal } from './BuildingStyleEditorModal';
import { useBuildingStyles } from '../hooks/useBuildingStyles';
import type { BuildingStyleDefinition } from '../shared/domain/building-style/buildingStyle';
import { ICON_STROKE_WIDTH } from '../shared/ui/iconTokens';

/** 2.1.1 品牌蓝（echo-map-unified-description.md） */
const BRAND_BLUE = '#0053D4';
const PANEL_BG = '#c6ddff';
const AUTH_FONT = '"Comfortaa", cursive';
/** 仅自上而下渐变，无左右方向；保持蓝色系 */
const PANEL_STACK = `
  linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(210,228,255,0.75) 38%, rgba(180,205,245,0.98) 100%),
  ${PANEL_BG}
`;

type ImageProvider = 'jimeng' | 'gemini';
type AvatarSubmenu = 'account' | 'version' | 'model' | 'style' | null;
type PaidPlanId = 'plus' | 'pro';

type PaymentOrder = {
  id: string;
  planName: string;
  amountCny: number;
  credits: number;
  paymentUrl: string;
  instructions: string;
  provider: 'manual' | 'wechat_native' | 'alipay_page';
};

const MODEL_OPTIONS = [
  { id: 'jimeng', label: '即梦' },
  { id: 'gemini', label: 'Gemini' },
] as const;

const MONO_FONT = '"Roboto Mono", ui-monospace, monospace';

function metadataString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function emailInitials(email: string): string {
  const localPart = email.split('@')[0]?.trim() ?? '';
  const first = localPart[0] ?? '';
  if (!/^[A-Za-z]$/.test(first)) return '';
  const second = localPart[1] ?? '';
  return `${first}${/^[A-Za-z]$/.test(second) ? second : ''}`.toUpperCase();
}

function defaultAccountName(email: string, phone: string, metadata: Record<string, unknown> | undefined): string {
  const metadataName = metadataString(metadata?.name) || metadataString(metadata?.full_name);
  if (metadataName) return metadataName;
  const localPart = email.split('@')[0]?.trim();
  if (localPart) return localPart;
  if (phone) return phone;
  return 'Account';
}

const IconLogout: React.FC = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M10 6H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4" />
    <path d="M13 8l5 4-5 4" />
    <path d="M18 12H9" />
  </svg>
);

const IconAccount: React.FC = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="8.2" r="3.2" />
    <path d="M5.8 18.6c1.4-2.7 3.7-4.1 6.2-4.1s4.8 1.4 6.2 4.1" />
  </svg>
);

const IconPlan: React.FC = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="4.2" y="5" width="15.6" height="14" rx="2" />
    <path d="M7.5 9h9" />
    <path d="M7.5 12h4.8" />
    <path d="M8.2 16.1h2.6M13.2 16.1h2.6" />
  </svg>
);

const IconSparkles: React.FC = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 2c1 5 4 8 10 9-6 1-9 4-10 11-1-7-4-10-10-11 6-1 9-4 10-9Z" />
    <path d="M18.5 2.5v2M17.5 3.5h2" />
    <path d="M5.5 17.5v2M4.5 18.5h2" />
  </svg>
);

const IconStyle: React.FC = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3v18M3 12h18" />
    <path d="m5.6 5.6 12.8 12.8M18.4 5.6 5.6 18.4" />
  </svg>
);

const IconChevronRight: React.FC = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const IconEdit: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
  </svg>
);

const GeminiBrandIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <defs>
      <linearGradient id="sidebarGeminiGradient" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#1A73E8" />
        <stop offset="30%" stopColor="#34A853" />
        <stop offset="60%" stopColor="#FBBC04" />
        <stop offset="100%" stopColor="#EA4335" />
      </linearGradient>
    </defs>
    <path d="M12 1.8c1.6 4.9 4.4 7.7 9.2 9.2-4.8 1.5-7.6 4.3-9.2 11.2-1.6-6.9-4.4-9.7-9.2-11.2 4.8-1.5 7.6-4.3 9.2-9.2Z" fill="url(#sidebarGeminiGradient)" />
  </svg>
);

const OpenAIBrandIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729Zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .0386.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944Zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464ZM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956Zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.7664.7664 0 0 0-.407-.667Zm2.0107-3.0231-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.679Zm-12.6413 4.1347-2.02-1.1638a.0804.0804 0 0 1-.0387-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805-4.7783 2.7582a.7948.7948 0 0 0-.3927.6813l-.004 6.7225Zm1.0976-2.3654 2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
  </svg>
);

const JimengBrandIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <defs>
      <linearGradient id="sidebarJimengGradient" x1="4" y1="3.5" x2="20" y2="20.5" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#23A7FF" />
        <stop offset="55%" stopColor="#55D3FF" />
        <stop offset="100%" stopColor="#1A5CFF" />
      </linearGradient>
    </defs>
    <path d="M12 2.2c1.2 3.4 3.2 5.4 6.6 6.6-3.4 1.2-5.4 3.2-6.6 8.8-1.2-5.6-3.2-7.6-6.6-8.8 3.4-1.2 5.4-3.2 6.6-6.6Z" fill="url(#sidebarJimengGradient)" />
  </svg>
);

const IconSidebarToggle: React.FC<{ collapsed: boolean }> = ({ collapsed }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="4" y="5" width="16" height="14" rx="1.5" />
    <path d="M10 5v14" />
    {collapsed ? <path d="m13 12 3-2.5v5L13 12Z" fill="currentColor" stroke="none" /> : <path d="m11 12 3-2.5v5L11 12Z" fill="currentColor" stroke="none" />}
  </svg>
);

const IconHomeLine: React.FC = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m3 10.5 9-7 9 7" />
    <path d="M5.5 9.8v9.2h13V9.8" />
    <path d="M9.4 19v-5.2h5.2V19" />
  </svg>
);

const IconGalleryLine: React.FC = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="4" y="5" width="16" height="14" rx="1.8" />
    <path d="m7.5 15.3 3.2-3.6 2.8 2.9 2.6-3 3.4 3.9" />
    <circle cx="9" cy="9" r="1.2" />
  </svg>
);

const IconAvatarLine: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="8.2" r="3.2" />
    <path d="M5.8 18.6c1.4-2.7 3.7-4.1 6.2-4.1s4.8 1.4 6.2 4.1" />
  </svg>
);

export interface EchoSidebarProps {
  activeTab: 'home' | 'gallery';
  onNavigate: (tab: 'home' | 'gallery') => void;
  statsFade?: number;
  homeStatusSlot: React.ReactNode;
  galleryStatsSlot: React.ReactNode;
  /** 侧栏底部固定区（如云端登录） */
  footerSlot?: React.ReactNode;
  /** 登录流程进入表单后才显示底部半透明承载面板 */
  footerHasSurface?: boolean;
  imageProvider: ImageProvider;
  imageProviderAvailability?: Partial<Record<ImageProvider, boolean>> | null;
  onImageProviderChange: (provider: ImageProvider) => void;
}

export const EchoSidebar: React.FC<EchoSidebarProps> = ({
  activeTab,
  onNavigate,
  statsFade = 1,
  homeStatusSlot,
  galleryStatsSlot,
  footerSlot,
  footerHasSurface = true,
  imageProvider,
  imageProviderAvailability,
  onImageProviderChange,
}) => {
  const { user, session, signOut } = useAuth();
  const { t, language } = useLocalization();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [activeSubmenu, setActiveSubmenu] = React.useState<AvatarSubmenu>(null);
  const [pendingPaymentPlan, setPendingPaymentPlan] = React.useState<PaidPlanId | null>(null);
  const [paymentError, setPaymentError] = React.useState<string | null>(null);
  const [editingStyle, setEditingStyle] = React.useState<BuildingStyleDefinition | null>(null);
  const [creatingStyle, setCreatingStyle] = React.useState(false);
  const [menuAnchorRect, setMenuAnchorRect] = React.useState<DOMRect | null>(null);
  const [collapsed, setCollapsed] = React.useState(false);
  const avatarButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const avatarUploadRef = React.useRef<HTMLInputElement | null>(null);
  const navInactive = '#5C6670';
  const navActive = '#111111';
  const accountEmail = user?.email?.trim() ?? '';
  const accountPhone = user?.phone?.trim()
    || metadataString(user?.user_metadata?.phone)
    || metadataString(user?.user_metadata?.phone_number);
  const profileStorageKey = `echomap-web-profile-${user?.id || accountEmail || accountPhone || 'user'}`;
  const avatarInitials = emailInitials(accountEmail);
  const [accountName, setAccountName] = React.useState(() => {
    if (typeof window === 'undefined') return defaultAccountName(accountEmail, accountPhone, user?.user_metadata);
    return window.localStorage.getItem(`${profileStorageKey}:name`) || defaultAccountName(accountEmail, accountPhone, user?.user_metadata);
  });
  const [profilePhone, setProfilePhone] = React.useState(() => {
    if (typeof window === 'undefined') return accountPhone;
    return window.localStorage.getItem(`${profileStorageKey}:phone`) ?? accountPhone;
  });
  const [avatarSrc, setAvatarSrc] = React.useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(`${profileStorageKey}:avatar`);
  });
  const { styles, update, create, remove } = useBuildingStyles();

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    setAvatarSrc(window.localStorage.getItem(`${profileStorageKey}:avatar`));
    setAccountName(window.localStorage.getItem(`${profileStorageKey}:name`) || defaultAccountName(accountEmail, accountPhone, user?.user_metadata));
    setProfilePhone(window.localStorage.getItem(`${profileStorageKey}:phone`) ?? accountPhone);
  }, [accountEmail, accountPhone, profileStorageKey, user?.user_metadata]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(`${profileStorageKey}:name`, accountName);
  }, [accountName, profileStorageKey]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(`${profileStorageKey}:phone`, profilePhone);
  }, [profilePhone, profileStorageKey]);

  const updateAvatar = React.useCallback((file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : null;
      if (!value) return;
      setAvatarSrc(value);
      window.localStorage.setItem(`${profileStorageKey}:avatar`, value);
    };
    reader.readAsDataURL(file);
  }, [profileStorageKey]);

  const createPaymentOrder = React.useCallback(async (planId: PaidPlanId, paymentWindow?: Window | null) => {
    setPaymentError(null);
    if (!session?.access_token || !user) {
      paymentWindow?.close();
      setPaymentError('请先登录后再购买额度。');
      return;
    }

    setPendingPaymentPlan(planId);
    try {
      const response = await fetch(apiUrl('/api/payments/create-order'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ planId, contact: accountEmail || profilePhone || null }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        order?: PaymentOrder;
        paymentFormHtml?: string;
        error?: string;
      };
      if (!response.ok || !data.order) {
        throw new Error(data.error || `Unable to create order (${response.status})`);
      }
      if (data.paymentFormHtml) {
        if (!paymentWindow) throw new Error('浏览器拦截了支付窗口，请允许弹出窗口后重试。');
        try {
          try {
            paymentWindow.opener = null;
          } catch {
            // The browser may make opener immutable for a newly opened tab.
          }
          paymentWindow.document.open();
          paymentWindow.document.write(data.paymentFormHtml);
          paymentWindow.document.close();
        } catch {
          throw new Error('无法打开支付宝收银台，请重试。');
        }
      } else if (paymentWindow) {
        try {
          paymentWindow.opener = null;
        } catch {
          // Some browsers do not allow changing opener on a blank window.
        }
        paymentWindow.location.href = data.order.paymentUrl;
      } else {
        window.open(data.order.paymentUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      paymentWindow?.close();
      const message = error instanceof Error ? error.message : '';
      setPaymentError(message.includes('payment plan is not available') ? '支付链接还没有配置，请稍后再试。' : message || '创建订单失败，请稍后再试。');
    } finally {
      setPendingPaymentPlan(null);
    }
  }, [accountEmail, profilePhone, session?.access_token, user]);

  const closeAvatarMenu = React.useCallback(() => {
    setMenuOpen(false);
    setActiveSubmenu(null);
    setMenuAnchorRect(null);
  }, []);

  const refreshMenuAnchor = React.useCallback(() => {
    const rect = avatarButtonRef.current?.getBoundingClientRect();
    if (rect) setMenuAnchorRect(rect);
  }, []);

  React.useEffect(() => {
    if (!collapsed) return;
    closeAvatarMenu();
  }, [collapsed, closeAvatarMenu]);

  React.useEffect(() => {
    if (!menuOpen) return;
    refreshMenuAnchor();
    window.addEventListener('resize', refreshMenuAnchor);
    window.addEventListener('scroll', refreshMenuAnchor, true);
    return () => {
      window.removeEventListener('resize', refreshMenuAnchor);
      window.removeEventListener('scroll', refreshMenuAnchor, true);
    };
  }, [menuOpen, refreshMenuAnchor]);

  const glassOrbClass =
    'flex h-10 min-h-10 w-10 min-w-10 items-center justify-center rounded-full border bg-white/72 text-[#0B1118] text-[16px] leading-none backdrop-blur-[18px] transition-all duration-300';
  const railIconButtonClass =
    'flex h-9 w-9 items-center justify-center border-0 bg-transparent p-0 transition-colors duration-300';
  const glassOrbStyle: React.CSSProperties = {
    background:
      'linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(245,250,255,0.8) 44%, rgba(226,238,255,0.74) 100%)',
    boxShadow:
      '0 18px 42px rgba(128,168,222,0.17), inset 0 1px 0 rgba(255,255,255,0.94), inset 0 -10px 18px rgba(200,220,255,0.18)',
    borderColor: 'rgba(255,255,255,0.96)',
    borderWidth: '1px',
  };
  const collapseButtonClass =
    `hidden md:flex absolute top-4 z-[6] h-8 w-8 items-center justify-center border-0 bg-transparent text-[#818b99] transition-all duration-300 hover:text-[#0053D4] ${
      collapsed ? 'left-1/2 -translate-x-1/2' : 'left-4'
    }`;
  const collapseButtonStyle: React.CSSProperties = {
    boxShadow: 'none',
  };

  const renderAvatarContent = (imageClassName = 'h-full w-full object-cover') => {
    if (avatarSrc) return <img src={avatarSrc} alt="" className={imageClassName} />;
    if (avatarInitials) return avatarInitials;
    return <IconAccount />;
  };

  const renderAvatarButton = (className?: string) => (
    <button
      ref={avatarButtonRef}
      type="button"
      onClick={() => {
        if (!user) {
          setCollapsed(false);
          onNavigate('home');
          return;
        }
        if (menuOpen) {
          closeAvatarMenu();
          return;
        }
        const rect = avatarButtonRef.current?.getBoundingClientRect() ?? null;
        setMenuAnchorRect(rect);
        setActiveSubmenu(null);
        setMenuOpen(true);
      }}
      className={className ?? 'flex h-10 min-h-10 w-10 min-w-10 items-center justify-center rounded-full border border-white/70 bg-white/78 text-[#0053D4] text-[16px] leading-none tracking-wide cursor-pointer backdrop-blur-md'}
      style={
        className
          ? {
              ...glassOrbStyle,
              fontFamily: user ? '"Roboto Mono", ui-monospace, monospace' : undefined,
              fontWeight: user ? 400 : undefined,
              color: user ? '#0053D4' : '#0B1118',
            }
          : { fontFamily: '"Roboto Mono", ui-monospace, monospace', fontWeight: 400 }
      }
      aria-label={user ? 'Avatar menu' : 'Open sidebar'}
    >
      {user ? renderAvatarContent() : <IconAvatarLine />}
    </button>
  );

  const avatarMenu = (() => {
    const anchorRect = menuAnchorRect ?? avatarButtonRef.current?.getBoundingClientRect() ?? null;
    if (!user || !menuOpen || !anchorRect || typeof document === 'undefined' || typeof window === 'undefined') {
      return null;
    }

    const mainWidth = 176;
    const submenuWidth = activeSubmenu === 'version' ? 244 : activeSubmenu === 'style' ? 260 : 204;
    const estimatedMainHeight = 174;
    const mainLeft = Math.min(Math.max(12, anchorRect.left), window.innerWidth - mainWidth - 12);
    const mainTop = Math.min(Math.max(12, anchorRect.top - estimatedMainHeight - 12), window.innerHeight - estimatedMainHeight - 12);
    const submenuLeft = Math.min(mainLeft + mainWidth + 8, window.innerWidth - submenuWidth - 12);
    const submenuTop = mainTop;
    const rowClass = 'flex min-h-[30px] w-full items-center gap-2 border border-transparent bg-transparent px-2 py-0.5 text-left text-[13px] text-[#111] hover:border-[#1687ff] hover:bg-[#c6ddff]/65 rounded-[5px] transition-colors';
    const activeRowClass = 'border-[#1687ff] bg-[#c6ddff]/65';
    const submenuPanelClass = 'fixed rounded-none bg-white px-2 py-1.5 shadow-[0_12px_28px_rgba(0,0,0,0.16)]';
    const iconSlotClass = 'flex h-3.5 w-3.5 shrink-0 items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5';

    const modelIcon = (id: ImageProvider) => {
      if (id === 'gemini') return <GeminiBrandIcon />;
      return <JimengBrandIcon />;
    };
    const planRows = [
      { id: null, name: t('helpPlanFreeName'), price: t('helpPlanFreePrice'), detail: language === 'zh' ? '8 次 + 每月 2 次' : '8 starter + 2/mo' },
      { id: 'plus' as const, name: t('helpPlanPlusName'), price: t('helpPlanPlusPrice'), detail: language === 'zh' ? '每月 20 次' : '20 generations/mo' },
      { id: 'pro' as const, name: t('helpPlanProName'), price: t('helpPlanProPrice'), detail: language === 'zh' ? '每月 60 次' : '60 generations/mo' },
    ];

    const submenuContent = activeSubmenu ? (
      <div
        className={submenuPanelClass}
        style={{
          left: submenuLeft,
          top: submenuTop,
          width: submenuWidth,
          zIndex: 230,
          fontFamily: MONO_FONT,
          fontWeight: 400,
          maxHeight: activeSubmenu === 'version' ? 'calc(100vh - 24px)' : undefined,
          overflowY: activeSubmenu === 'version' ? 'auto' : undefined,
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {activeSubmenu === 'account' && (
          <div className="space-y-1.5 text-left text-[11px] text-[#111]">
            <div className="flex items-center gap-2 px-1 py-1">
              <button
                type="button"
                className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-black/25 bg-white text-[12px] text-[#0053D4]"
                style={{ fontFamily: MONO_FONT }}
                onClick={() => avatarUploadRef.current?.click()}
                aria-label="Upload avatar"
              >
                {renderAvatarContent()}
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-semibold text-[#111]">{t('accountMenu')}</div>
                <div className="mt-0.5 min-w-0 truncate text-[11px] text-[#666]">
                  {accountEmail || accountName}
                </div>
              </div>
            </div>
            <input
              ref={avatarUploadRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                updateAvatar(event.target.files?.[0] ?? null);
                event.currentTarget.value = '';
              }}
            />
          </div>
        )}

        {activeSubmenu === 'version' && (
          <div className="space-y-1 text-left text-[11px] text-[#111]">
            {planRows.map((plan) => (
              <button
                key={plan.name}
                type="button"
                disabled={!plan.id || pendingPaymentPlan === plan.id}
                onClick={(event) => {
                  event.stopPropagation();
                  if (plan.id) {
                    const paymentWindow = window.open('about:blank', '_blank');
                    void createPaymentOrder(plan.id, paymentWindow);
                  }
                }}
                className="block w-full rounded-[5px] border border-transparent bg-transparent px-2 py-1 text-left transition-colors hover:border-[#1687ff] hover:bg-[#c6ddff]/65 disabled:cursor-default disabled:opacity-70"
                data-map-ui="version-plan-row"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-[12px] font-semibold">{plan.name}</span>
                  <span className="shrink-0 text-[10.5px] font-semibold text-[#555]">{plan.price}</span>
                </div>
                <div className="mt-0.5 text-[10.5px] leading-[1.35] text-[#666]">{plan.detail}</div>
                {plan.id && pendingPaymentPlan === plan.id && <div className="mt-0.5 text-[10px] text-[#1687ff]">创建订单中...</div>}
              </button>
            ))}
            {paymentError && <div className="rounded-[5px] border border-red-200 bg-red-50 px-2 py-1 text-[10px] leading-[1.35] text-red-700">{paymentError}</div>}
          </div>
        )}

        {activeSubmenu === 'model' && (
          <div className="space-y-1">
            {MODEL_OPTIONS.map((item) => {
              const selected = imageProvider === item.id;
              const disabled = imageProviderAvailability?.[item.id] === false;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={disabled}
                  className={`flex min-h-[28px] w-full items-center gap-2 rounded-[5px] border border-transparent bg-transparent px-2 py-0.5 text-left text-[13px] transition-colors ${
                    disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer hover:border-[#1687ff] hover:bg-[#c6ddff]/65'
                  } ${selected ? 'border-[#1687ff] bg-[#c6ddff]/65' : ''}`}
                  style={{ color: disabled ? '#9A9A9A' : selected ? '#0053D4' : '#111', fontFamily: MONO_FONT, fontWeight: selected ? 600 : 400 }}
                  onClick={() => {
                    if (disabled) return;
                    onImageProviderChange(item.id);
                    closeAvatarMenu();
                  }}
                >
                  <span className={iconSlotClass}>{modelIcon(item.id)}</span>
                  <span className="min-w-0 truncate">{item.label}</span>
                  {disabled && (
                    <span className="ml-auto shrink-0 text-[10px] text-[#888]">
                      {t('providerNotConfigured')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {activeSubmenu === 'style' && (
          <div className="space-y-1 text-left text-[13px] text-[#111]">
            {styles.map((style) => (
              <button
                key={style.id}
                type="button"
                className="flex min-h-[30px] w-full items-center gap-2 rounded-[5px] border border-transparent bg-transparent px-2 py-1 text-left text-[13px] text-[#111] transition-colors hover:border-[#1687ff] hover:bg-[#c6ddff]/65"
                onClick={() => {
                  setEditingStyle(style);
                  setCreatingStyle(false);
                  closeAvatarMenu();
                }}
              >
                <span className="min-w-0 flex-1 truncate">{style.name}</span>
                <IconEdit />
              </button>
            ))}
            <button
              type="button"
              className="mt-1 flex min-h-[30px] w-full items-center gap-2 border-t border-black/10 bg-transparent px-2 pt-2 text-left text-[13px] text-[#0053D4] hover:underline"
              onClick={() => {
                setEditingStyle({
                  id: 'custom-draft',
                  name: language === 'zh' ? '自定义风格' : 'Custom style',
                  prompt: '',
                  builtin: false,
                });
                setCreatingStyle(true);
                closeAvatarMenu();
              }}
            >
              <span className="text-[15px] leading-none">＋</span>
              <span>{language === 'zh' ? '新建自定义风格' : 'New custom style'}</span>
            </button>
          </div>
        )}
      </div>
    ) : null;

    return createPortal(
      <div className="fixed inset-0 z-[220]" onMouseDown={closeAvatarMenu} data-map-ui="avatar-menu-layer">
        <div
          className="fixed rounded-none bg-white px-2 py-1.5 shadow-[0_12px_28px_rgba(0,0,0,0.16)]"
          style={{ left: mainLeft, top: mainTop, width: mainWidth, zIndex: 225, fontFamily: MONO_FONT, fontWeight: 400 }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {([
            ['account', <IconAccount />, t('accountMenu')],
            ['version', <IconPlan />, t('versionPlanMenu')],
            ['style', <IconStyle />, language === 'zh' ? '风格' : 'Style'],
            ['model', <IconSparkles />, t('modelMenu')],
          ] as const).map(([id, icon, label]) => (
            <button
              key={id}
              type="button"
              className={`${rowClass} ${activeSubmenu === id ? activeRowClass : ''}`}
              onPointerEnter={() => setActiveSubmenu(id)}
              onMouseEnter={() => setActiveSubmenu(id)}
              onMouseDown={(event) => {
                event.stopPropagation();
                setActiveSubmenu(id);
              }}
              onClick={() => setActiveSubmenu(id)}
            >
              <span className={iconSlotClass}>{icon}</span>
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <IconChevronRight />
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              closeAvatarMenu();
              void signOut();
            }}
            className={`${rowClass} mt-0.5`}
          >
            <span className={iconSlotClass}><IconLogout /></span>
            <span className="min-w-0 flex-1 truncate">{t('authSignOut')}</span>
          </button>
        </div>
        {submenuContent}
      </div>,
      document.body,
    );
  })();

  return (
    <aside
      className={`relative flex h-[100dvh] max-h-[100dvh] min-h-0 w-full shrink-0 flex-col items-center overflow-x-hidden overflow-y-auto overscroll-none text-center px-5 pt-[2.5vh] pb-[2.5vh] md:sticky md:top-0 md:z-30 md:min-h-[100dvh] md:shrink-0 md:grow-0 md:self-start transition-[max-width,min-width,basis,padding] duration-500 ease-out ${
        collapsed
          ? 'md:min-w-[88px] md:max-w-[88px] md:basis-[88px] md:px-2'
          : 'md:min-w-[280px] md:max-w-[440px] md:basis-[30%]'
      }`}
      style={{
        background: PANEL_STACK,
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        color: '#332115',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)',
      }}
    >
      <SidebarNoiseCanvas />
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className={collapseButtonClass}
        style={collapseButtonStyle}
        aria-label={collapsed ? t('expandSidebar') : t('collapseSidebar')}
      >
        <IconSidebarToggle collapsed={collapsed} />
      </button>
      {collapsed ? (
        <div className="relative z-[1] hidden h-full w-full md:flex md:flex-col md:items-center md:justify-between md:pt-16 md:pb-5">
          <div className="flex flex-col items-center gap-5">
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className={railIconButtonClass}
              style={{
                color: activeTab === 'home' ? BRAND_BLUE : '#818b99',
              }}
              aria-label={t('homeTab')}
            >
              <IconHomeLine />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('gallery')}
              className={railIconButtonClass}
              style={{
                color: activeTab === 'gallery' ? BRAND_BLUE : '#818b99',
              }}
              aria-label={t('galleryTab')}
            >
              <IconGalleryLine />
            </button>
          </div>
          <div className="relative">
            {renderAvatarButton(glassOrbClass)}
          </div>
        </div>
      ) : (
        <>
          <nav
            className="relative z-[1] mb-[9vh] flex w-[52%] max-w-[220px] shrink-0 items-stretch rounded-full border border-black/25 bg-white/75 p-[4px] shadow-[0_1px_0_rgba(0,0,0,0.06)] backdrop-blur-md"
            style={{ minHeight: '4.8vh' }}
            aria-label={t('primaryNavigation')}
          >
            <div
              className="pointer-events-none absolute top-[4px] bottom-[4px] w-[calc(50%-6px)] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-[left] duration-500 ease-out"
              style={{ left: activeTab === 'home' ? 4 : 'calc(50% + 2px)' }}
            />
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className={`relative z-[1] flex-1 min-w-0 rounded-full border-0 cursor-pointer px-2 py-2 text-[20px] transition-[background,color] duration-200 ease-out ${
                activeTab === 'home' ? '' : 'hover:bg-black/[0.06]'
              }`}
              style={{
                fontFamily: AUTH_FONT,
                fontWeight: 700,
                color: activeTab === 'home' ? navActive : navInactive,
              }}
            >
              {t('homeTab')}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('gallery')}
              className={`relative z-[1] flex-1 min-w-0 rounded-full border-0 cursor-pointer px-2 py-2 text-[20px] transition-[background,color] duration-200 ease-out ${
                activeTab === 'gallery' ? '' : 'hover:bg-black/[0.06]'
              }`}
              style={{
                fontFamily: AUTH_FONT,
                fontWeight: 700,
                color: activeTab === 'gallery' ? navActive : navInactive,
              }}
            >
              {t('galleryTab')}
            </button>
          </nav>

          <div className="relative z-[1] flex min-h-0 w-full min-w-0 flex-1 flex-col items-center justify-start overflow-visible">
            <h1
              className="m-0 mb-[4vh] shrink-0 w-[84%] max-w-none text-center text-[clamp(2.35rem,4.2vw,3.85rem)]"
              style={{
                color: BRAND_BLUE,
                fontFamily: '"Gasoek One", sans-serif',
                fontWeight: 400,
                lineHeight: 1,
                letterSpacing: '0.01px',
              }}
            >
              Echo Map
            </h1>

            <div className="mb-[4vh] w-full shrink-0 flex justify-center px-1">
              <EchoSidebarBrandIllustration />
            </div>

            {(!footerSlot || user) && (
              <p
                className="m-0 w-[68%] max-w-[300px] shrink-0 text-center text-[15px] leading-[1.25] px-1"
                style={{
                  color: BRAND_BLUE,
                  fontFamily: AUTH_FONT,
                  fontWeight: 700,
                }}
              >
                {t('sidebarTagline')}
              </p>
            )}

            <div className="mt-[4vh] flex w-full max-w-[320px] flex-1 min-h-0 flex-col items-stretch">
              {activeTab === 'home' && <div className="w-full">{homeStatusSlot}</div>}
              {activeTab === 'gallery' && (
                <div className="w-full transition-opacity duration-500 ease-out" style={{ opacity: statsFade }}>
                  {galleryStatsSlot}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {footerSlot && !collapsed && !user && (
        <div className={`relative z-[5] mt-auto flex min-h-0 w-[calc(100%+2.5rem)] flex-[0_0_35%] -mx-5 -mb-[2.5vh] flex-col overflow-hidden rounded-t-[2rem] px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] ${
          footerHasSurface ? 'bg-white/60 backdrop-blur-md' : 'bg-transparent'
        }`}>
          {footerSlot}
        </div>
      )}

      {user && !collapsed && (
        <div className="absolute left-5 bottom-5 z-[5]" style={{ bottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
          {renderAvatarButton()}
        </div>
      )}
      {avatarMenu}
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
          if (window.confirm(language === 'zh' ? '删除这个自定义风格？' : 'Delete this custom style?')) {
            remove(editingStyle.id);
            setEditingStyle(null);
          }
        }}
      />
    </aside>
  );
};
