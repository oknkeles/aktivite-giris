import { useEffect, useRef, useState } from 'react';

// Sayaç animasyonu — 0'dan hedefe yumuşak geçiş (ease-out cubic)
export function CountUp({
  value,
  format,
  duration = 900,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
}) {
  const [n, setN] = useState(0);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    const start = performance.now();
    function tick(t: number) {
      const p = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(value * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else setN(value);
    }
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value, duration]);

  return <>{format ? format(n) : Math.round(n).toString()}</>;
}

// Gri iskelet blok — yükleme sırasında
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`bg-paper-2 rounded-lg animate-pulse ${className}`} />;
}
