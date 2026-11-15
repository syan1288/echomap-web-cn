import React from 'react';

type IconProps = {
  strokeWidth?: number;
};

function SvgIcon({
  children,
  strokeWidth = 1.7,
}: React.PropsWithChildren<IconProps>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function EchoArrowRightIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M5 12h13" />
      <path d="m13 6 6 6-6 6" />
    </SvgIcon>
  );
}

export function EchoPencilIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="m16.5 4.5 3 3L8 19H5v-3Z" />
      <path d="M13.8 7.2l3 3" />
    </SvgIcon>
  );
}

export function EchoCameraIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <rect x="4" y="8.6" width="16" height="10.4" rx="2" />
      <circle cx="12" cy="13.5" r="2.2" />
      <path d="M12 1.2v8.2" />
      <path d="M9.8 4.3 12 2.1l2.2 2.2" />
    </SvgIcon>
  );
}

export function EchoDownloadIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </SvgIcon>
  );
}

export function EchoMailIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4.5 7 7.5 6 7.5-6" />
    </SvgIcon>
  );
}

export function EchoKeyIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="9" cy="9" r="4" />
      <path d="m12 12 8 8" />
      <path d="m17 17 2-2" />
      <path d="m19 19 2-2" />
    </SvgIcon>
  );
}

export function EchoHomeIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="m3 10.5 9-7 9 7" />
      <path d="M5.5 9.8v9.2h13V9.8" />
      <path d="M9.4 19v-5.2h5.2V19" />
    </SvgIcon>
  );
}

export function EchoMapIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="m3.5 6.5 5-2 7 3 5-2v12l-5 2-7-3-5 2Z" />
      <path d="M8.5 4.5v12" />
      <path d="M15.5 7.5v12" />
      <path d="M5.2 13.4 8.5 12l7 3 3.3-1.3" opacity="0.72" />
    </SvgIcon>
  );
}

export function EchoGalleryIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <rect x="4" y="5" width="16" height="14" rx="1.8" />
      <path d="m7.5 15.3 3.2-3.6 2.8 2.9 2.6-3 3.4 3.9" />
      <circle cx="9" cy="9" r="1.2" />
    </SvgIcon>
  );
}

export function EchoSettingsIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.3 13.7a7.9 7.9 0 0 0 .1-1.7 7.9 7.9 0 0 0-.1-1.7l2-1.5-2-3.4-2.4 1a7.5 7.5 0 0 0-2.9-1.7L13.7 2h-3.4L9.9 4.7A7.5 7.5 0 0 0 7 6.4l-2.4-1-2 3.4 2 1.5a7.9 7.9 0 0 0-.1 1.7 7.9 7.9 0 0 0 .1 1.7l-2 1.5 2 3.4 2.4-1a7.5 7.5 0 0 0 2.9 1.7l.4 2.7h3.4l.3-2.7a7.5 7.5 0 0 0 2.9-1.7l2.4 1 2-3.4Z" />
    </SvgIcon>
  );
}

export function EchoMapStyleIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="13.5" cy="6.5" r=".55" />
      <circle cx="17.5" cy="10.5" r=".55" />
      <circle cx="8.5" cy="7.5" r=".55" />
      <circle cx="6.5" cy="12.5" r=".55" />
      <path d="M12 3a9 9 0 1 0 9 9c0-1.1-.9-2-2-2h-2.2a1.8 1.8 0 0 1-1.8-1.8c0-.5.2-.9.5-1.3l1.1-1.1A2.4 2.4 0 0 0 15 3h-3Z" />
    </SvgIcon>
  );
}

export function EchoLocationPinIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 21c4.6-4.1 7-7.4 7-10.2A7 7 0 1 0 5 10.8C5 13.6 7.4 16.9 12 21Z" />
      <circle cx="12" cy="10" r="2.5" />
    </SvgIcon>
  );
}

export function EchoSearchIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m16.2 16.2 4.3 4.3" />
    </SvgIcon>
  );
}

export function EchoPlusIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </SvgIcon>
  );
}

export function EchoMinusIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M5 12h14" />
    </SvgIcon>
  );
}

export function EchoRefreshIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M3 2v6h6" />
      <path d="M21 12A9 9 0 0 0 6 5.3L3 8" />
      <path d="M21 22v-6h-6" />
      <path d="M3 12a9 9 0 0 0 15 6.7l3-2.7" />
    </SvgIcon>
  );
}

export function EchoSparklesIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 2c1 5 4 8 10 9-6 1-9 4-10 11-1-7-4-10-10-11 6-1 9-4 10-9Z" />
      <path d="M18.5 2.5v2" />
      <path d="M17.5 3.5h2" />
      <path d="M5.5 17.5v2" />
      <path d="M4.5 18.5h2" />
    </SvgIcon>
  );
}

export function EchoTargetIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 2.5v3" />
      <path d="M12 18.5v3" />
      <path d="M2.5 12h3" />
      <path d="M18.5 12h3" />
    </SvgIcon>
  );
}
