// TDev Consulting logo — SVG inline, ölçeklendirilebilir.

interface LogoProps {
  /** Yükseklik px cinsinden. Genişlik orana göre ayarlanır (2.8x). */
  height?: number;
  /** Sadece pin (T) gösterir, yazılı kısım yok. */
  compact?: boolean;
  /** Karanlık temada beyaz renkli versiyon. */
  light?: boolean;
  className?: string;
}

export default function Logo({ height = 32, compact = false, light = false, className }: LogoProps) {
  const navy = light ? '#FFFFFF' : '#0F2440';
  const orange = '#F5A623';
  const bg = light ? '#0F2440' : '#FFFFFF';

  if (compact) {
    return (
      <svg
        viewBox="0 0 80 100"
        height={height}
        className={className}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M 40 12 Q 64 12 64 38 Q 64 58 40 88 Q 16 58 16 38 Q 16 12 40 12 Z" fill={navy} />
        <circle cx="40" cy="38" r="22" fill={bg} />
        <path d="M 27 26 L 53 26 L 53 32 L 43 32 L 43 50 L 37 50 L 37 32 L 27 32 Z" fill={orange} />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 280 100"
      height={height}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M 40 12 Q 64 12 64 38 Q 64 58 40 88 Q 16 58 16 38 Q 16 12 40 12 Z" fill={navy} />
      <circle cx="40" cy="38" r="22" fill={bg} />
      <path d="M 27 26 L 53 26 L 53 32 L 43 32 L 43 50 L 37 50 L 37 32 L 27 32 Z" fill={orange} />
      <line x1="80" y1="22" x2="80" y2="78" stroke={navy} strokeWidth="2" />
      <text
        x="94"
        y="56"
        fontFamily="Helvetica, Arial, sans-serif"
        fontWeight="700"
        fontSize="38"
        fill={navy}
        letterSpacing="-1"
      >
        tdev
      </text>
      <text
        x="94"
        y="78"
        fontFamily="Helvetica, Arial, sans-serif"
        fontWeight="400"
        fontSize="14"
        fill={navy}
        letterSpacing="0.5"
      >
        consulting
      </text>
    </svg>
  );
}
