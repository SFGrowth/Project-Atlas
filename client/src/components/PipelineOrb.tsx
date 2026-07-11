/**
 * ORION PIPELINE ORB — v2
 * 14 nodes float in slow orbital drift around the ORION core.
 * Electric pulse arcs connect each node to the core.
 * Nodes light up green sequentially as pipeline stages pass.
 * When all 14 go green: the core EXPLODES with arc-reactor energy.
 */
import { useEffect, useRef, useState } from "react";

// ─── Stage Definitions ────────────────────────────────────────────────────────

const STAGES = [
  { id: 1,  short: "CFG",  label: "CONFIG",    color: "#22d3ee" },
  { id: 2,  short: "STA",  label: "STATE",     color: "#22d3ee" },
  { id: 3,  short: "MKT",  label: "MARKET",    color: "#38bdf8" },
  { id: 4,  short: "A1",   label: "MODEL A1",  color: "#818cf8" },
  { id: 5,  short: "A3",   label: "MODEL A3",  color: "#818cf8" },
  { id: 6,  short: "B1",   label: "MODEL B1",  color: "#818cf8" },
  { id: 7,  short: "ADE",  label: "ADE",       color: "#f472b6" },
  { id: 8,  short: "ARI",  label: "ARI",       color: "#fb923c" },
  { id: 9,  short: "TVL",  label: "TVL",       color: "#facc15" },
  { id: 10, short: "EXE",  label: "EXECUTION", color: "#4ade80" },
  { id: 11, short: "OBS",  label: "OBSERVE",   color: "#34d399" },
  { id: 12, short: "BRN",  label: "BRAIN",     color: "#a78bfa" },
  { id: 13, short: "MIS",  label: "MISSION",   color: "#60a5fa" },
  { id: 14, short: "HBT",  label: "HEARTBEAT", color: "#22d3ee" },
];

type NodeState = "idle" | "active" | "pass" | "fail" | "blocked";

interface PipelineOrbProps {
  stagesPassed?: number;
  failedStage?: number | null;
  running?: boolean;
  tradeApproved?: boolean;
  lastRun?: string | null;
  size?: number;
}

// ─── Seeded pseudo-random ─────────────────────────────────────────────────────
function seededRand(seed: number) {
  const x = Math.sin(seed + 1) * 43758.5453123;
  return x - Math.floor(x);
}

// ─── Build a jittery lightning arc path ──────────────────────────────────────
function buildArcPath(
  cx: number, cy: number,
  nx: number, ny: number,
  jitterSeed: number
): string {
  const dx = nx - cx, dy = ny - cy;
  const len = Math.sqrt(dx * dx + dy * dy);
  const px = -dy / len, py = dx / len;
  const j1 = (seededRand(jitterSeed * 3.7) - 0.5) * 22;
  const j2 = (seededRand(jitterSeed * 7.1) - 0.5) * 16;
  const t1 = 0.35, t2 = 0.65;
  const c1x = cx + dx * t1 + px * j1;
  const c1y = cy + dy * t1 + py * j1;
  const c2x = cx + dx * t2 + px * j2;
  const c2y = cy + dy * t2 + py * j2;
  return `M ${cx} ${cy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${nx} ${ny}`;
}

// ─── Explosion particle ───────────────────────────────────────────────────────
interface Particle {
  id: number;
  angle: number;
  speed: number;
  size: number;
  color: string;
  life: number; // 0→1
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PipelineOrb({
  stagesPassed = 0,
  failedStage = null,
  running = false,
  tradeApproved = false,
  lastRun = null,
  size = 520,
}: PipelineOrbProps) {
  const cx = size / 2, cy = size / 2;
  const orbitR   = size * 0.375;
  const coreR    = size * 0.10;
  const nodeR    = size * 0.054;

  // ── Animation tick ──
  const [tick, setTick] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  useEffect(() => {
    const loop = (ts: number) => {
      if (ts - lastRef.current > 16) { // ~60fps
        setTick(t => t + 1);
        lastRef.current = ts;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  // ── Explosion state ──
  const [exploding, setExploding] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [explodeTick, setExplodeTick] = useState(0);
  const explodeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevRunRef = useRef<string | null>(null);
  const allPassed = stagesPassed === 14;

  useEffect(() => {
    if (allPassed && lastRun !== prevRunRef.current) {
      prevRunRef.current = lastRun;
      // Generate particles
      const colors = ["#22c55e","#4ade80","#86efac","#22d3ee","#7dd3fc","#facc15","#a78bfa","#f472b6"];
      const ps: Particle[] = Array.from({ length: 48 }, (_, i) => ({
        id: i,
        angle: (i / 48) * Math.PI * 2 + seededRand(i) * 0.4,
        speed: 0.8 + seededRand(i * 7) * 1.4,
        size: 2 + seededRand(i * 13) * 5,
        color: colors[i % colors.length],
        life: 0,
      }));
      setParticles(ps);
      setExploding(true);
      setExplodeTick(0);
      let t = 0;
      explodeRef.current = setInterval(() => {
        t += 1;
        setExplodeTick(t);
        if (t > 80) {
          setExploding(false);
          setParticles([]);
          if (explodeRef.current) clearInterval(explodeRef.current);
        }
      }, 20);
    }
    return () => { if (explodeRef.current) clearInterval(explodeRef.current); };
  }, [allPassed, lastRun]);

  // ── Node positions: base orbit + slow floating drift ──
  const time = tick * 0.008; // slow global time
  const nodes = STAGES.map((stage, i) => {
    const baseAngle = (i / STAGES.length) * 2 * Math.PI - Math.PI / 2;
    // Each node drifts slightly: unique frequency and phase
    const driftAmp   = orbitR * 0.045;
    const driftFreqR = 0.18 + seededRand(i * 5) * 0.14; // radial drift freq
    const driftFreqT = 0.12 + seededRand(i * 9) * 0.10; // tangential drift freq
    const driftPhR   = seededRand(i * 3) * Math.PI * 2;
    const driftPhT   = seededRand(i * 7) * Math.PI * 2;
    const r = orbitR + Math.sin(time * driftFreqR + driftPhR) * driftAmp;
    const a = baseAngle + Math.sin(time * driftFreqT + driftPhT) * 0.06;
    return {
      ...stage,
      x: cx + r * Math.cos(a),
      y: cy + r * Math.sin(a),
      baseAngle,
      jitter: i + tick * 0.04, // arc jitter seed
    };
  });

  // ── State helpers ──
  const getState = (id: number): NodeState => {
    if (failedStage === id) return "fail";
    if (failedStage !== null && id > failedStage) return "blocked";
    if (id <= stagesPassed) return "pass";
    if (running && id === stagesPassed + 1) return "active";
    return "idle";
  };

  const nodeFill = (state: NodeState, base: string) => {
    switch (state) {
      case "pass":    return "#22c55e";
      case "active":  return "#facc15";
      case "fail":    return "#ef4444";
      case "blocked": return "#1e293b";
      default:        return base + "33";
    }
  };

  const arcStroke = (state: NodeState, base: string) => {
    switch (state) {
      case "pass":    return "#22c55e";
      case "active":  return "#facc15";
      case "fail":    return "#ef4444";
      default:        return base + "18";
    }
  };

  const dashOffset = (tick * 1.8) % 40;

  // ── Core pulse: breathe when running, explode when all pass ──
  const corePulse = allPassed
    ? 1 + Math.sin(tick * 0.15) * 0.08
    : running
    ? 1 + Math.sin(tick * 0.08) * 0.04
    : 1;

  const coreColor = allPassed ? "#22c55e" : running ? "#0ea5e9" : "#0369a1";
  const coreGlow  = allPassed
    ? `0 0 ${32 * corePulse}px #22c55e, 0 0 ${64 * corePulse}px #22c55e55`
    : running
    ? `0 0 ${20 * corePulse}px #0ea5e9, 0 0 ${40 * corePulse}px #0ea5e922`
    : "none";

  return (
    <div className="relative flex flex-col items-center select-none">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ overflow: "visible" }}
      >
        <defs>
          <radialGradient id="coreGradOrb" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor={coreColor} stopOpacity="0.85" />
            <stop offset="55%"  stopColor={coreColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor="#020617"   stopOpacity="0.0"  />
          </radialGradient>
          <filter id="glowOrb" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="strongGlowOrb" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="8" result="b" />
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="particleGlow" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* ── Orbit guide ring ── */}
        <circle cx={cx} cy={cy} r={orbitR}
          fill="none" stroke="#0ea5e9" strokeWidth="0.5" strokeOpacity="0.10"
          strokeDasharray="3 9" />
        <circle cx={cx} cy={cy} r={orbitR * 1.12}
          fill="none" stroke="#0ea5e9" strokeWidth="0.3" strokeOpacity="0.05" />

        {/* ── Explosion rings ── */}
        {exploding && [0, 1, 2, 3].map(i => {
          const progress = Math.max(0, (explodeTick - i * 8) / 60);
          if (progress <= 0) return null;
          const r = coreR * (1 + progress * (5 + i * 2));
          const opacity = Math.max(0, 1 - progress * 1.2);
          return (
            <circle key={`ring-${i}`}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={i % 2 === 0 ? "#22c55e" : "#4ade80"}
              strokeWidth={3 - i * 0.5}
              strokeOpacity={opacity}
              filter="url(#glowOrb)"
            />
          );
        })}

        {/* ── Explosion particles ── */}
        {exploding && particles.map(p => {
          const progress = Math.min(1, explodeTick / 70);
          const dist = p.speed * progress * orbitR * 1.1;
          const fade = progress > 0.5 ? 1 - (progress - 0.5) * 2 : 1;
          const px2 = cx + Math.cos(p.angle) * dist;
          const py2 = cy + Math.sin(p.angle) * dist;
          return (
            <circle key={p.id}
              cx={px2} cy={py2}
              r={p.size * (1 - progress * 0.5)}
              fill={p.color}
              fillOpacity={fade * 0.9}
              filter="url(#particleGlow)"
            />
          );
        })}

        {/* ── Electric arcs ── */}
        {nodes.map((node, i) => {
          const state = getState(node.id);
          const color = arcStroke(state, node.color);
          const isPass = state === "pass";
          const isActive = state === "active";
          const path = buildArcPath(cx, cy, node.x, node.y, node.jitter);
          const baseOpacity = isPass ? 0.55 : isActive ? 0.8 : 0.10;

          return (
            <g key={`arc-${node.id}`}>
              <path d={path} fill="none" stroke={color}
                strokeWidth={isPass ? 1.5 : 1}
                strokeOpacity={baseOpacity}
                strokeLinecap="round" />
              {(isPass || isActive) && (
                <path d={path} fill="none"
                  stroke={isActive ? "#facc15" : "#22c55e"}
                  strokeWidth={isActive ? 2.5 : 1.5}
                  strokeOpacity={isActive ? 0.95 : 0.45}
                  strokeDasharray="5 15"
                  strokeDashoffset={-(dashOffset + i * 4)}
                  strokeLinecap="round" />
              )}
            </g>
          );
        })}

        {/* ── Core glow halo ── */}
        <circle cx={cx} cy={cy}
          r={coreR * 2.2 * corePulse}
          fill="url(#coreGradOrb)"
          style={{ filter: allPassed ? "url(#strongGlowOrb)" : undefined }}
        />

        {/* ── Core outer ring ── */}
        <circle cx={cx} cy={cy}
          r={coreR * corePulse}
          fill="none"
          stroke={coreColor}
          strokeWidth="1.8"
          strokeOpacity="0.8"
          strokeDasharray={running || allPassed ? "5 5" : "none"}
          strokeDashoffset={allPassed ? dashOffset * 3 : -dashOffset * 2}
          filter="url(#glowOrb)"
        />

        {/* ── Core inner rings ── */}
        <circle cx={cx} cy={cy} r={coreR * 0.72 * corePulse}
          fill={allPassed ? "#052e16" : "#061828"}
          stroke={coreColor} strokeWidth="1" strokeOpacity="0.7"
        />
        <circle cx={cx} cy={cy} r={coreR * 0.50 * corePulse}
          fill="none"
          stroke={allPassed ? "#4ade80" : "#7dd3fc"}
          strokeWidth="0.8" strokeOpacity="0.5"
          strokeDasharray="3 5"
          strokeDashoffset={dashOffset * (allPassed ? 4 : 3)}
        />
        {/* Extra inner ring when all pass */}
        {allPassed && (
          <circle cx={cx} cy={cy} r={coreR * 0.30 * corePulse}
            fill="none" stroke="#86efac" strokeWidth="1" strokeOpacity="0.7"
            strokeDasharray="2 4" strokeDashoffset={-dashOffset * 5}
          />
        )}

        {/* ── Core label ── */}
        <text x={cx} y={cy - 7} textAnchor="middle" dominantBaseline="middle"
          fill={allPassed ? "#4ade80" : "#7dd3fc"}
          fontSize={size * 0.028}
          fontFamily="'JetBrains Mono', monospace"
          fontWeight="700" letterSpacing="2"
        >
          ORION
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" dominantBaseline="middle"
          fill={allPassed ? "#22c55e" : running ? "#38bdf8" : "#334155"}
          fontSize={size * 0.017}
          fontFamily="'JetBrains Mono', monospace"
          letterSpacing="1" opacity="0.85"
        >
          {allPassed ? "TRADE OK" : running ? `${stagesPassed}/14` : stagesPassed > 0 ? `${stagesPassed}/14` : "STANDBY"}
        </text>

        {/* ── Stage nodes ── */}
        {nodes.map((node) => {
          const state = getState(node.id);
          const fill  = nodeFill(state, node.color);
          const isPass   = state === "pass";
          const isActive = state === "active";
          const isFail   = state === "fail";
          const isIdle   = state === "idle" || state === "blocked";

          // Subtle per-node float bob on top of position
          const bobAmp = nodeR * 0.12;
          const bobFreq = 0.22 + seededRand(node.id * 11) * 0.15;
          const bobPhase = seededRand(node.id * 17) * Math.PI * 2;
          const bobY = Math.sin(time * bobFreq + bobPhase) * bobAmp;

          const nx = node.x;
          const ny = node.y + bobY;

          return (
            <g key={`node-${node.id}`}
              filter={(isPass || isActive || isFail) ? "url(#glowOrb)" : undefined}
            >
              {/* Outer glow ring for pass/active */}
              {(isPass || isActive) && (
                <circle cx={nx} cy={ny} r={nodeR * 1.5}
                  fill="none"
                  stroke={isActive ? "#facc15" : "#22c55e"}
                  strokeWidth="1"
                  strokeOpacity={isActive ? 0.75 : 0.30}
                  strokeDasharray={isActive ? "3 3" : "none"}
                  strokeDashoffset={-dashOffset}
                />
              )}
              {/* Node body */}
              <circle cx={nx} cy={ny} r={nodeR}
                fill={fill}
                fillOpacity={isIdle ? 0.12 : 0.88}
                stroke={fill}
                strokeWidth={isActive ? 2 : 1}
                strokeOpacity={isIdle ? 0.18 : 0.85}
              />
              {/* Inner dot */}
              <circle cx={nx} cy={ny} r={nodeR * 0.32}
                fill={isIdle ? "#1e293b" : fill}
                fillOpacity={isIdle ? 0.35 : 1}
              />
              {/* Label */}
              <text x={nx} y={ny - 0.5}
                textAnchor="middle" dominantBaseline="middle"
                fill={isIdle ? "#475569" : "#fff"}
                fontSize={size * 0.021}
                fontFamily="'JetBrains Mono', monospace"
                fontWeight="600"
              >
                {node.short}
              </text>
              {/* Stage number */}
              <text x={nx} y={ny + nodeR + 11}
                textAnchor="middle" dominantBaseline="middle"
                fill={isIdle ? "#1e3a5f" : fill}
                fontSize={size * 0.015}
                fontFamily="'JetBrains Mono', monospace"
                opacity="0.75"
              >
                {String(node.id).padStart(2, "0")}
              </text>
            </g>
          );
        })}

        {/* ── All-pass celebration: spinning outer star burst ── */}
        {allPassed && [0, 1, 2, 3, 4, 5, 6, 7].map(i => {
          const a = (i / 8) * Math.PI * 2 + tick * 0.015;
          const r1 = coreR * 1.15 * corePulse;
          const r2 = coreR * 1.55 * corePulse;
          return (
            <line key={`ray-${i}`}
              x1={cx + r1 * Math.cos(a)} y1={cy + r1 * Math.sin(a)}
              x2={cx + r2 * Math.cos(a)} y2={cy + r2 * Math.sin(a)}
              stroke="#4ade80" strokeWidth="1.5" strokeOpacity="0.6"
              filter="url(#glowOrb)"
            />
          );
        })}
      </svg>

      {/* ── Legend strip ── */}
      <div className="mt-1 grid grid-cols-7 gap-x-3 gap-y-1 w-full max-w-[480px] px-2">
        {STAGES.map((stage) => {
          const state = getState(stage.id);
          return (
            <div key={stage.id} className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                state === "pass"    ? "bg-green-400" :
                state === "active"  ? "bg-yellow-400" :
                state === "fail"    ? "bg-red-400" :
                "bg-slate-700"
              }`} />
              <span className={`text-[9px] font-mono tracking-wide truncate ${
                state === "pass"    ? "text-green-400" :
                state === "active"  ? "text-yellow-400" :
                state === "fail"    ? "text-red-400" :
                "text-slate-600"
              }`}>
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
