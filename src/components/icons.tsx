/// 应用图标系统:统一 24 viewBox、1.8 描边、currentColor——不再用 unicode 字形充当图标
interface IconProps {
  size?: number;
  className?: string;
}

function Svg({
  size = 16,
  className,
  children,
  filled = false,
}: IconProps & { children: React.ReactNode; filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconPlay(props: IconProps) {
  return (
    <Svg {...props} filled>
      <path d="M8 5.5v13l11-6.5-11-6.5z" />
    </Svg>
  );
}

export function IconPause(props: IconProps) {
  return (
    <Svg {...props} filled>
      <rect x="7" y="6" width="3.4" height="12" rx="1" />
      <rect x="13.6" y="6" width="3.4" height="12" rx="1" />
    </Svg>
  );
}

export function IconStop(props: IconProps) {
  return (
    <Svg {...props} filled>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
    </Svg>
  );
}

export function IconLoop(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11v-1a4 4 0 014-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v1a4 4 0 01-4 4H3" />
    </Svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 13l4 4L19 7" />
    </Svg>
  );
}

export function IconEdit(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </Svg>
  );
}

export function IconCaretLeft(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M15 5l-7 7 7 7" />
    </Svg>
  );
}

export function IconCaretRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 5l7 7-7 7" />
    </Svg>
  );
}

export function IconCaretDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 9l7 7 7-7" />
    </Svg>
  );
}

export function IconCaretUp(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 15l7-7 7 7" />
    </Svg>
  );
}

export function IconOverflow(props: IconProps) {
  return (
    <Svg {...props} filled>
      <circle cx="5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
    </Svg>
  );
}

export function IconLayoutHorizontal(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 6l6 6-6 6" />
      <path d="M13 6l6 6-6 6" />
    </Svg>
  );
}

export function IconLayoutPage(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <path d="M4 12h16M12 4v16" />
    </Svg>
  );
}

export function IconMetronome({ active, size = 15, className }: IconProps & { active?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M9.5 3.5h5L17.5 19h-11L9.5 3.5z" />
      {active ? <path d="M12 16L16.5 8.5" /> : <path d="M12 16V9" />}
      <circle cx="12" cy="16" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
