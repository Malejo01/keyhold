/**
 * Generated illustration for a listing. Deterministic from the property id (never a real photo): a small
 * skyline whose sun, heights and facade tones vary per id. Colors come from tokens through Tailwind classes.
 */
function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const SKY = ["--primary-soft", "--accent-soft", "--warning-soft"] as const;
const SUN = ["--primary", "--accent", "--warning"] as const;
const FACADE = ["--surface", "--surface-sunken", "--surface-raised"] as const;
const v = (name: string) => ({ fill: `var(${name})` });

export function PropertyArt({ id, bedrooms, className }: { id: string; bedrooms: number; className?: string }) {
  const h = hash(id);
  const sky = SKY[h % 3];
  const sun = SUN[(h >>> 3) % 3];
  const sunX = 40 + ((h >>> 6) % 160);
  const mainH = 56 + ((h >>> 9) % 28);
  const sideH = 34 + ((h >>> 12) % 26);
  const sideLeft = (h >>> 15) % 2 === 0;
  const facade = FACADE[(h >>> 16) % 3];
  const cols = Math.min(Math.max(bedrooms, 1), 3) + 1;
  const mainX = 80;
  const mainW = 90;
  const mainTop = 120 - mainH;
  const windows: { x: number; y: number }[] = [];
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < cols; c++)
      windows.push({ x: mainX + 10 + c * ((mainW - 20) / cols), y: mainTop + 10 + r * 20 });
  const winW = (mainW - 20) / cols - 6;

  return (
    <svg viewBox="0 0 250 140" aria-hidden="true" preserveAspectRatio="xMidYMid slice" className={className}>
      <rect width="250" height="140" style={v(sky)} />
      <circle cx={sunX} cy="34" r="16" style={v(sun)} opacity="0.85" />
      {/* side building */}
      <rect
        x={sideLeft ? 28 : 184}
        y={120 - sideH}
        width="40"
        height={sideH}
        style={v("--border-strong")}
        rx="2"
      />
      {/* main building */}
      <rect x={mainX} y={mainTop} width={mainW} height={mainH} style={v(facade)} rx="3" />
      <rect x={mainX} y={mainTop} width={mainW} height="6" style={v("--primary")} rx="3" />
      {windows.map((w, i) => (
        <rect key={i} x={w.x} y={w.y} width={winW} height="12" style={v("--accent")} opacity="0.55" rx="1.5" />
      ))}
      <rect x={mainX + mainW / 2 - 7} y="104" width="14" height="16" style={v("--foreground")} opacity="0.75" rx="2" />
      {/* ground */}
      <rect y="120" width="250" height="20" style={v("--surface-sunken")} />
      <rect y="120" width="250" height="2" style={v("--border-strong")} />
    </svg>
  );
}
