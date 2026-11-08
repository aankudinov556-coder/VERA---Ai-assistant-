export type OrbState = "idle" | "thinking" | "speaking" | "listening";

export function Orb({ state }: { state: OrbState }) {
  return (
    <div className={`orb orb--${state}`} aria-hidden>
      <div className="orb__core" />
      <div className="orb__facet orb__facet--a" />
      <div className="orb__facet orb__facet--b" />
    </div>
  );
}
