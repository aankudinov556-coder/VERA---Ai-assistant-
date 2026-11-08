import { Sparkle } from "./Icons";

/** Фоновые светящиеся дуги и искры. В режиме эффектов «выключены» — статично и без размытия. */
const STARS: { x: string; y: string; s: number; d: number }[] = [
  { x: "10%", y: "13%", s: 22, d: 0 },
  { x: "12.5%", y: "17%", s: 14, d: 1.2 },
  { x: "10.5%", y: "42%", s: 18, d: 2.1 },
  { x: "8%", y: "73%", s: 58, d: 0.6 },
  { x: "86%", y: "28%", s: 26, d: 1.7 },
  { x: "92%", y: "45%", s: 44, d: 0.3 },
  { x: "95.5%", y: "92%", s: 22, d: 2.6 },
];

export function Decor() {
  return (
    <div className="decor" aria-hidden>
      <svg className="arcs" viewBox="0 0 1600 1000" preserveAspectRatio="none">
        <defs>
          <linearGradient id="arcGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffd60a" stopOpacity="0" />
            <stop offset=".35" stopColor="#ffd60a" stopOpacity=".9" />
            <stop offset=".7" stopColor="#ffb703" stopOpacity=".55" />
            <stop offset="1" stopColor="#ffd60a" stopOpacity="0" />
          </linearGradient>
          <filter id="arcGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <ellipse
          className="arc"
          cx="800"
          cy="400"
          rx="760"
          ry="250"
          transform="rotate(-12 800 400)"
          fill="none"
          stroke="url(#arcGrad)"
          strokeWidth="2.5"
          filter="url(#arcGlow)"
        />
        <path
          className="arc"
          d="M1000 1000 C 1250 860, 1450 800, 1600 780"
          fill="none"
          stroke="url(#arcGrad)"
          strokeWidth="3"
          filter="url(#arcGlow)"
        />
        <path
          className="arc"
          d="M0 920 C 160 890, 300 845, 420 785"
          fill="none"
          stroke="url(#arcGrad)"
          strokeWidth="2"
          filter="url(#arcGlow)"
        />
      </svg>
      {STARS.map((st, i) => (
        <span
          key={i}
          className="star"
          style={{ left: st.x, top: st.y, animationDelay: `${st.d}s` }}
        >
          <Sparkle size={st.s} />
        </span>
      ))}
    </div>
  );
}
