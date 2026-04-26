import React from 'react';
import { EchoSidebarBrandIllustration } from './EchoSidebarBrandIllustration';
import { SidebarNoiseCanvas } from './SidebarNoiseCanvas';
import { useAuth } from '../context/AuthContext';

/** 2.1.1 品牌蓝（echo-map-unified-description.md） */
const BRAND_BLUE = '#0053D4';
const PANEL_BG = '#c6ddff';
/** 仅自上而下渐变，无左右方向；保持蓝色系 */
const PANEL_STACK = `
  linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(210,228,255,0.75) 38%, rgba(180,205,245,0.98) 100%),
  ${PANEL_BG}
`;

const MODEL_OPTIONS = [
  { id: 'gemini', label: 'Gemini' },
  { id: 'gpt-image-2', label: 'GPT Image 2' },
  { id: 'jimeng', label: '即梦' },
] as const;

const IconSparkles: React.FC = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 2c1 5 4 8 10 9-6 1-9 4-10 11-1-7-4-10-10-11 6-1 9-4 10-9Z" />
    <path d="M18.5 2.5v2M17.5 3.5h2" />
    <path d="M5.5 17.5v2M4.5 18.5h2" />
  </svg>
);

const IconLogout: React.FC = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M10 6H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4" />
    <path d="M13 8l5 4-5 4" />
    <path d="M18 12H9" />
  </svg>
);

const GeminiBrandIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <defs>
      <linearGradient id="geminiGradient" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#1A73E8" />
        <stop offset="30%" stopColor="#34A853" />
        <stop offset="60%" stopColor="#FBBC04" />
        <stop offset="100%" stopColor="#EA4335" />
      </linearGradient>
    </defs>
    <path d="M12 1.8c1.6 4.9 4.4 7.7 9.2 9.2-4.8 1.5-7.6 4.3-9.2 11.2-1.6-6.9-4.4-9.7-9.2-11.2 4.8-1.5 7.6-4.3 9.2-9.2Z" fill="url(#geminiGradient)" />
  </svg>
);

const OpenAIBrandIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="2.1" />
    <path d="M12 4.6c1.7 0 3.2 1 3.9 2.5" />
    <path d="M18.4 8.2c.9 1.4.9 3.2 0 4.6" />
    <path d="M15.9 17c-.7 1.5-2.2 2.4-3.9 2.4" />
    <path d="M8.1 17c-1.7 0-3.2-.9-4-2.4" />
    <path d="M5.6 8.2c-.9 1.4-.9 3.2 0 4.6" />
    <path d="M8.1 7.1c.8-1.6 2.3-2.5 3.9-2.5" />
    <path d="M9.4 6.2l6.5 3.7v7.4l-6.5 3.7-6.4-3.7V9.9z" opacity="0.65" />
  </svg>
);

const JimengBrandIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <defs>
      <linearGradient id="jimengGradient" x1="4" y1="3.5" x2="20" y2="20.5" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#23A7FF" />
        <stop offset="55%" stopColor="#55D3FF" />
        <stop offset="100%" stopColor="#1A5CFF" />
      </linearGradient>
    </defs>
    <path d="M12 2.2c1.2 3.4 3.2 5.4 6.6 6.6-3.4 1.2-5.4 3.2-6.6 8.8-1.2-5.6-3.2-7.6-6.6-8.8 3.4-1.2 5.4-3.2 6.6-6.6Z" fill="url(#jimengGradient)" />
  </svg>
);

const IconSidebarToggle: React.FC<{ collapsed: boolean }> = ({ collapsed }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="4" y="5" width="16" height="14" rx="1.5" />
    <path d="M10 5v14" />
    {collapsed ? <path d="m13 12 3-2.5v5L13 12Z" fill="currentColor" stroke="none" /> : <path d="m11 12 3-2.5v5L11 12Z" fill="currentColor" stroke="none" />}
  </svg>
);

const IconHomeLine: React.FC = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m3 10.5 9-7 9 7" />
    <path d="M5.5 9.8v9.2h13V9.8" />
    <path d="M9.4 19v-5.2h5.2V19" />
  </svg>
);

const IconGalleryLine: React.FC = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="4" y="5" width="16" height="14" rx="1.8" />
    <path d="m7.5 15.3 3.2-3.6 2.8 2.9 2.6-3 3.4 3.9" />
    <circle cx="9" cy="9" r="1.2" />
  </svg>
);

const IconAvatarLine: React.FC = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
  imageProvider: 'gemini' | 'jimeng' | 'gpt-image-2';
  onImageProviderChange: (provider: 'gemini' | 'jimeng' | 'gpt-image-2') => void;
}

export const EchoSidebar: React.FC<EchoSidebarProps> = ({
  activeTab,
  onNavigate,
  statsFade = 1,
  homeStatusSlot,
  galleryStatsSlot,
  footerSlot,
  imageProvider,
  onImageProviderChange,
}) => {
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [modelHover, setModelHover] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const modelCloseTimerRef = React.useRef<number | null>(null);
  const navInactive = '#5C6670';
  const navActive = '#111111';
  const initials = (user?.email ?? 'US').slice(0, 2).toUpperCase();
  const FONT_GOOGLE_SANS = '"Roboto", "Google Sans", system-ui, sans-serif';

  const keepModelMenuOpen = React.useCallback(() => {
    if (modelCloseTimerRef.current !== null) {
      window.clearTimeout(modelCloseTimerRef.current);
      modelCloseTimerRef.current = null;
    }
    setModelHover(true);
  }, []);

  const scheduleModelMenuClose = React.useCallback(() => {
    if (modelCloseTimerRef.current !== null) {
      window.clearTimeout(modelCloseTimerRef.current);
    }
    modelCloseTimerRef.current = window.setTimeout(() => {
      setModelHover(false);
      modelCloseTimerRef.current = null;
    }, 180);
  }, []);

  React.useEffect(
    () => () => {
      if (modelCloseTimerRef.current !== null) {
        window.clearTimeout(modelCloseTimerRef.current);
      }
    },
    []
  );

  React.useEffect(() => {
    if (!collapsed) return;
    setMenuOpen(false);
    setModelHover(false);
  }, [collapsed]);

  const glassOrbClass =
    'flex h-14 w-14 items-center justify-center rounded-full border bg-white/72 text-[#0B1118] backdrop-blur-[18px] transition-all duration-300';
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

  const renderAvatarButton = (className?: string) => (
    <button
      type="button"
      onClick={() => {
        if (!user) {
          setCollapsed(false);
          onNavigate('home');
          return;
        }
        setMenuOpen((v) => !v);
      }}
      className={className ?? 'h-14 w-14 rounded-full border border-white/70 bg-white/78 text-[#0053D4] text-[18px] tracking-wide cursor-pointer backdrop-blur-md'}
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
      {user ? initials : <IconAvatarLine />}
    </button>
  );

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
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
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
              aria-label="Home"
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
              aria-label="Gallery"
            >
              <IconGalleryLine />
            </button>
          </div>
          <div className="relative">
            {user && menuOpen && (
              <div
                className="absolute bottom-[74px] left-1/2 min-w-[220px] -translate-x-1/2 rounded-none bg-white px-3 py-2 shadow-[0_8px_20px_rgba(0,0,0,0.12)]"
                style={{ fontFamily: FONT_GOOGLE_SANS, fontWeight: 400 }}
                onMouseLeave={scheduleModelMenuClose}
              >
                <button
                  type="button"
                  className="w-full rounded-none border-0 bg-transparent px-1 py-1.5 text-left text-[13px] text-[#111] cursor-pointer hover:bg-black/5 flex items-center justify-between"
                  style={{ fontFamily: FONT_GOOGLE_SANS, fontWeight: 400 }}
                  onMouseEnter={keepModelMenuOpen}
                  onMouseLeave={scheduleModelMenuClose}
                >
                  <span className="inline-flex items-center gap-2">
                    <IconSparkles />
                    <span>Model</span>
                  </span>
                  <span aria-hidden className="text-[15px]">&gt;</span>
                </button>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="w-full rounded-none border-0 bg-transparent px-1 py-1.5 text-left text-[13px] text-[#111] cursor-pointer hover:bg-black/5 inline-flex items-center gap-2"
                  style={{ fontFamily: FONT_GOOGLE_SANS, fontWeight: 400 }}
                >
                  <IconLogout />
                  <span>Log out</span>
                </button>
                {modelHover && (
                  <div
                    className="absolute right-full top-0 h-full w-3"
                    onMouseEnter={keepModelMenuOpen}
                  />
                )}
                {modelHover && (
                  <div
                    className="absolute right-[228px] top-0 min-w-[190px] rounded-none bg-white px-2 py-2 shadow-[0_8px_20px_rgba(0,0,0,0.12)]"
                    onMouseEnter={keepModelMenuOpen}
                    onMouseLeave={scheduleModelMenuClose}
                  >
                    {MODEL_OPTIONS.map((item) => {
                      const selected = imageProvider === item.id;
                      const disabled = item.id === 'gpt-image-2';
                      return (
                        <button
                          key={item.id}
                          type="button"
                          disabled={disabled}
                          className={`w-full rounded-none border-0 bg-transparent px-2 py-1.5 text-left text-[13px] inline-flex items-center gap-2 ${
                            disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-black/5'
                          }`}
                          style={{
                            color: disabled ? '#9A9A9A' : selected ? '#0053D4' : '#111',
                            fontFamily: FONT_GOOGLE_SANS,
                            fontWeight: 400,
                          }}
                          onClick={() => {
                            if (disabled) return;
                            onImageProviderChange(item.id as 'gemini' | 'jimeng' | 'gpt-image-2');
                            setMenuOpen(false);
                            setModelHover(false);
                          }}
                        >
                          {item.id === 'gemini' && <GeminiBrandIcon />}
                          {item.id === 'gpt-image-2' && <OpenAIBrandIcon />}
                          {item.id === 'jimeng' && <JimengBrandIcon />}
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {renderAvatarButton(glassOrbClass)}
          </div>
        </div>
      ) : (
        <>
          <nav
            className="relative z-[1] mb-[9vh] flex w-[52%] max-w-[220px] shrink-0 items-stretch rounded-full border border-black/25 bg-white/75 p-[4px] shadow-[0_1px_0_rgba(0,0,0,0.06)] backdrop-blur-md"
            style={{ minHeight: '4.8vh' }}
            aria-label="Primary"
          >
            <div
              className="pointer-events-none absolute top-[4px] bottom-[4px] w-[calc(50%-6px)] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-[left] duration-500 ease-out"
              style={{ left: activeTab === 'home' ? 4 : 'calc(50% + 2px)' }}
            />
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className={`relative z-[1] flex-1 min-w-0 rounded-full border-0 cursor-pointer px-2 py-2 text-[14px] transition-[background,color] duration-200 ease-out ${
                activeTab === 'home' ? '' : 'hover:bg-black/[0.06]'
              }`}
              style={{
                fontFamily: '"Plus Jakarta Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
                fontWeight: activeTab === 'home' ? 700 : 500,
                color: activeTab === 'home' ? navActive : navInactive,
              }}
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => onNavigate('gallery')}
              className={`relative z-[1] flex-1 min-w-0 rounded-full border-0 cursor-pointer px-2 py-2 text-[14px] transition-[background,color] duration-200 ease-out ${
                activeTab === 'gallery' ? '' : 'hover:bg-black/[0.06]'
              }`}
              style={{
                fontFamily: '"Plus Jakarta Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
                fontWeight: activeTab === 'gallery' ? 700 : 500,
                color: activeTab === 'gallery' ? navActive : navInactive,
              }}
            >
              Gallery
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

            <p
              className="m-0 w-[68%] max-w-[300px] shrink-0 text-center text-[15px] leading-[1.25] px-1"
              style={{
                color: BRAND_BLUE,
                fontFamily: '"Plus Jakarta Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
                fontWeight: 400,
              }}
            >
              Stories and photos of long walks,
              <br />
              wrong turns,
              <br />
              and everyday discoveries
            </p>

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
        <div className="absolute left-5 right-5 bottom-5 z-[5] border-t border-black/10 pt-3">
          {footerSlot}
        </div>
      )}

      {user && !collapsed && (
        <div className="absolute left-5 bottom-5 z-[5]">
          {menuOpen && (
            <div
              className="absolute bottom-[62px] left-0 min-w-[220px] rounded-none bg-white px-3 py-2 shadow-[0_8px_20px_rgba(0,0,0,0.12)]"
              style={{ fontFamily: FONT_GOOGLE_SANS, fontWeight: 400 }}
              onMouseLeave={scheduleModelMenuClose}
            >
              <button
                type="button"
                className="w-full rounded-none border-0 bg-transparent px-1 py-1.5 text-left text-[13px] text-[#111] cursor-pointer hover:bg-black/5 flex items-center justify-between"
                style={{ fontFamily: FONT_GOOGLE_SANS, fontWeight: 400 }}
                onMouseEnter={keepModelMenuOpen}
                onMouseLeave={scheduleModelMenuClose}
              >
                <span className="inline-flex items-center gap-2">
                  <IconSparkles />
                  <span>Model</span>
                </span>
                <span aria-hidden className="text-[15px]">&gt;</span>
              </button>
              <button
                type="button"
                onClick={() => void signOut()}
                className="w-full rounded-none border-0 bg-transparent px-1 py-1.5 text-left text-[13px] text-[#111] cursor-pointer hover:bg-black/5 inline-flex items-center gap-2"
                style={{ fontFamily: FONT_GOOGLE_SANS, fontWeight: 400 }}
              >
                <IconLogout />
                <span>Log out</span>
              </button>
              {modelHover && (
                <div
                  className="absolute left-[198px] top-0 h-full w-3"
                  onMouseEnter={keepModelMenuOpen}
                />
              )}
              {modelHover && (
                <div
                  className="absolute left-[206px] top-0 min-w-[190px] rounded-none bg-white px-2 py-2 shadow-[0_8px_20px_rgba(0,0,0,0.12)]"
                  onMouseEnter={keepModelMenuOpen}
                  onMouseLeave={scheduleModelMenuClose}
                >
                  {MODEL_OPTIONS.map((item) => {
                    const selected = imageProvider === item.id;
                    const disabled = item.id === 'gpt-image-2';
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={disabled}
                        className={`w-full rounded-none border-0 bg-transparent px-2 py-1.5 text-left text-[13px] inline-flex items-center gap-2 ${
                          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-black/5'
                        }`}
                        style={{
                          color: disabled ? '#9A9A9A' : selected ? '#0053D4' : '#111',
                          fontFamily: FONT_GOOGLE_SANS,
                          fontWeight: 400,
                        }}
                        onClick={() => {
                          if (disabled) return;
                          onImageProviderChange(item.id as 'gemini' | 'jimeng' | 'gpt-image-2');
                          setMenuOpen(false);
                          setModelHover(false);
                        }}
                      >
                        {item.id === 'gemini' && <GeminiBrandIcon />}
                        {item.id === 'gpt-image-2' && <OpenAIBrandIcon />}
                        {item.id === 'jimeng' && <JimengBrandIcon />}
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {renderAvatarButton()}
        </div>
      )}
    </aside>
  );
};
