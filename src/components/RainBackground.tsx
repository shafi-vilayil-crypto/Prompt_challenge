// Soft falling raindrops behind the student screen (the session's raindrop story). Decorative only.

const DROPS = Array.from({ length: 22 }, (_, i) => {
  // Fixed pseudo-random spread so every render looks the same.
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return {
    left: `${Math.round(r(1) * 100)}%`,
    delay: `${(r(2) * 9).toFixed(2)}s`,
    duration: `${(6 + r(3) * 7).toFixed(2)}s`,
    size: 6 + Math.round(r(4) * 10),
    opacity: 0.18 + r(5) * 0.35,
  };
});

export function RainBackground() {
  return (
    <div className="rain-bg" aria-hidden="true">
      <span className="glow glow-a" />
      <span className="glow glow-b" />
      {DROPS.map((d, i) => (
        <span
          key={i}
          className="drop"
          style={{ left: d.left, animationDelay: d.delay, animationDuration: d.duration, width: d.size, height: d.size * 1.35, opacity: d.opacity }}
        />
      ))}
    </div>
  );
}
