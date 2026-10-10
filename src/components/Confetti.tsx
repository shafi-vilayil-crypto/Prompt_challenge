import { useEffect, useRef } from 'react';

// Party-popper confetti from both bottom corners, drawn on a canvas for about 5 seconds.
// Skipped for people who turn on "reduce motion".

const COLORS = ['#ffd45c', '#8fd3ff', '#ff9db0', '#9be59b', '#c9a7ff', '#f4f1e6', '#ffb877'];

type Bit = { x: number; y: number; vx: number; vy: number; r: number; spin: number; w: number; h: number; color: string; round: boolean };

export function Confetti({ onDone }: { onDone?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { onDone?.(); return; }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = () => { canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    size();
    window.addEventListener('resize', size);

    const bits: Bit[] = [];
    const pop = (fromLeft: boolean, n: number) => {
      for (let i = 0; i < n; i++) {
        const angle = (fromLeft ? -60 : -120) + (Math.random() - 0.5) * 50; // degrees, upward and inward
        const speed = 9 + Math.random() * 9;
        bits.push({
          x: fromLeft ? 10 : innerWidth - 10, y: innerHeight - 10,
          vx: Math.cos((angle * Math.PI) / 180) * speed, vy: Math.sin((angle * Math.PI) / 180) * speed,
          r: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.3,
          w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
          color: COLORS[Math.floor(Math.random() * COLORS.length)], round: Math.random() < 0.25,
        });
      }
    };
    pop(true, 90); pop(false, 90);
    const second = setTimeout(() => { pop(true, 60); pop(false, 60); }, 700);

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const b of bits) {
        b.vy += 0.28; b.vx *= 0.99; b.vy *= 0.99;
        b.x += b.vx; b.y += b.vy; b.r += b.spin;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.r);
        ctx.fillStyle = b.color;
        if (b.round) { ctx.beginPath(); ctx.arc(0, 0, b.w / 2, 0, Math.PI * 2); ctx.fill(); }
        else ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r)));
        ctx.restore();
      }
      if (now - start < 5200) frame = requestAnimationFrame(tick);
      else { ctx.clearRect(0, 0, innerWidth, innerHeight); onDone?.(); }
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); clearTimeout(second); window.removeEventListener('resize', size); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={ref} className="confetti" aria-hidden="true" />;
}
