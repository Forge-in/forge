interface WrathMarkProps {
  size?: number;
  /** Stroke of the outer hex. The inner W is always four units heavier. */
  strokeWidth?: number;
  className?: string;
}

/** The Wrath hex-and-W mark. Decorative: the wordmark beside it carries the name. */
export function WrathMark({ size = 24, strokeWidth = 8, className }: WrathMarkProps) {
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path
        d="M60 6 L106 33 L106 87 L60 114 L14 87 L14 33 Z"
        stroke="var(--wc-accent)"
        strokeWidth={strokeWidth}
        strokeLinejoin="miter"
      />
      <path
        d="M34 42 L50 84 L60 58 L70 84 L86 42"
        stroke="var(--wc-ink)"
        strokeWidth={strokeWidth + 4}
        strokeLinejoin="miter"
      />
    </svg>
  );
}
