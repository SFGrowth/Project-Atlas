/**
 * ORION PIPELINE ORB — v4
 * 14 orbs try to drift away from the core brain but are held by electric tethers.
 * Every orb is always connected. Tethers crackle with electricity at all times.
 * Orbs start orange. They turn green one by one as each pipeline stage passes.
 * When all 14 go green the core explodes.
 */
import { useEffect, useRef, useState } from "react";

const STAGES = [
  { id: 1,  short: "CFG",  label: "CONFIG"    },
  { id: 2,  short: "STA",  label: "STATE"     },
  { id: 3,  short: "MKT",  label: "MARKET"    },
  { id: 4,  short: "A1",   label: "MODEL A1"  },
  { id: 5,  short: "A3",   label: "MODEL A3"  },
  { id: 6,  short: "B1",   label: "MODEL B1"  },
  { id: 7,  short: "ADE",  label: "ADE"       },
  { id: 8,  short: "ARI",  label: "ARI"       },
  { id: 9,  short: "TVL",  label: "TVL"       },
  { id: 10, short: "EXE",  label: "EXECUTION" },
  { id: 11, short: "OBS",  label: "OBSERVE"   },
  { id: 12, short: "BRN",  label: "BRAIN"     },
  { id: 13, short: "MIS",  label: "MISSION"   },
  { id: 14, short: "HBT",  label: "HEARTBEAT" },
];

function sr(seed: number) {
  const x = Math.sin(seed + 1) * 43758.5453;
  return x - Math.floor(x);
}

type NodeState = "pending" | "active" | "pass" | "fail";

interface PipelineOrbProps {
  stagesPassed?: number;
  failedStage?: number | null;
  running?: boolean;
  tradeApproved?: boolean;
  lastRun?: string | null;
  size?: number;
}

export default function PipelineOrb({
  stagesPassed = 0,
  failedStage = null,
  running = false,
  tradeApproved = false,
  lastRun = null,
  size = 520,
}: PipelineOrbProps) {
  const cx = size / 2;
  const cy = size / 2;
  const orbitR = size * 0.36;
  const coreR  = size * 0.095;
  const nodeR  = size * 0.058;

  // ── Tick ──────────────────────────────────────────────────────────────────
  const [tick, setTick] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastTs = useRef(0);
  useEffect(() => {
    const loop = (ts: number) => {
      if (ts - lastTs.current > 16) { setTick(t => t + 1); lastTs.current = ts; }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  // ── Explosion ─────────────────────────────────────────────────────────────
  const [explodeTick, setExplodeTick] = useState(-1);
  const prevRun = useRef<string | null>(null);
  const explodeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const allPassed = stagesPassed === 14;
  useEffect(() => {
    if (allPassed && lastRun !== prevRun.current) {
      prevRun.current = lastRun;
      setExplodeTick(0);
      let t = 0;
      explodeTimer.current = setInterval(() => {
        t++;
        setExplodeTick(t);
        if (t > 100) { setExplodeTick(-1); clearInterval(explodeTimer.current!); }
      }, 18);
    }
    return () => { if (explodeTimer.current) clearInterval(explodeTimer.current); };
  }, [allPassed, lastRun]);
  const exploding = explodeTick >= 0;

  // ── State ─────────────────────────────────────────────────────────────────
  const getState = (id: number): NodeState => {
    if (failedStage === id) return "fail";
    if (id <= stagesPassed) return "pass";
    if (running && id === stagesPassed + 1) return "active";
    return "pending";
  };

  const orbColor = (state: NodeState) => {
    switch (state) {
      case "pass":    return { fill: "#15803d", stroke: "#4ade80", glow: "#22c55e", pulse: "#86efac" };
      case "active":  return { fill: "#c2410c", stroke: "#fb923c", glow: "#f97316", pulse: "#fed7aa" };
      case "fail":    return { fill: "#991b1b", stroke: "#ef4444", glow: "#ef4444", pulse: "#fca5a5" };
      default:        return { fill: "#7c2d12", stroke: "#ea580c", glow: "#f97316", pulse: "#fdba74" };
    }
  };

  // ── Node positions: escape drift + spring-back tension ────────────────────
  // Each orb tries to escape outward on a unique path but is pulled back.
  // The "escape" is a large-amplitude slow drift; the tether creates a
  // visible stretch effect by keeping the arc curved toward the orb.
  const time = tick * 0.022; // faster tick so motion is always visible
  const nodes = STAGES.map((stage, i) => {
    const baseAngle = (i / STAGES.length) * Math.PI * 2 - Math.PI / 2;

    // Each orb moves continuously on its own path — never pauses
    // Multiple overlapping sine waves so motion never looks periodic/frozen
    const freqR1 = 0.28 + sr(i * 5) * 0.22;
    const freqR2 = 0.41 + sr(i * 6) * 0.19;
    const phR1   = sr(i * 7) * Math.PI * 2;
    const phR2   = sr(i * 8) * Math.PI * 2;

    const freqA1 = 0.19 + sr(i * 9) * 0.17;
    const freqA2 = 0.33 + sr(i * 10) * 0.14;
    const phA1   = sr(i * 11) * Math.PI * 2;
    const phA2   = sr(i * 12) * Math.PI * 2;

    // Radial: two overlapping waves — always in motion, never settles
    const rBase = orbitR * (0.82 + sr(i * 3) * 0.26);
    const r = rBase
      + Math.sin(time * freqR1 + phR1) * orbitR * 0.20
      + Math.sin(time * freqR2 + phR2) * orbitR * 0.10;

    // Angular: two overlapping waves — orb wanders continuously
    const a = baseAngle
      + Math.sin(time * freqA1 + phA1) * 0.30
      + Math.sin(time * freqA2 + phA2) * 0.15;

    // Bob: two overlapping vertical waves
    const bobFreq1 = 0.22 + sr(i * 13) * 0.18;
    const bobFreq2 = 0.37 + sr(i * 14) * 0.15;
    const bobPh1   = sr(i * 17) * Math.PI * 2;
    const bobPh2   = sr(i * 18) * Math.PI * 2;
    const bob = Math.sin(time * bobFreq1 + bobPh1) * nodeR * 0.50
              + Math.sin(time * bobFreq2 + bobPh2) * nodeR * 0.25;

    return {
      ...stage,
      x: cx + r * Math.cos(a),
      y: cy + r * Math.sin(a) + bob,
      baseAngle,
    };
  });

  // ── Electric arc path with live jitter ────────────────────────────────────
  // The arc bends toward the orb's escape direction, simulating tension.
  const buildTether = (nx: number, ny: number, i: number) => {
    const dx = nx - cx, dy = ny - cy;
    const len = Math.sqrt(dx * dx + dy * dy);
    const px = -dy / len, py = dx / len; // perpendicular
    // Jitter: higher amplitude so the arc visibly bends and crackles
    const j1 = Math.sin(tick * 0.10 + i * 2.1 + 0.0) * 18;
    const j2 = Math.sin(tick * 0.13 + i * 3.3 + 1.0) * 14;
    const j3 = Math.sin(tick * 0.08 + i * 1.7 + 2.0) * 10;
    // Stretch bias: arc bows outward in the direction the orb is pulling
    // This makes the tether look like it's under tension
    const stretchBias = (len - orbitR) * 0.18; // positive = orb is far, arc bows more
    const c1x = cx + dx * 0.28 + px * (j1 + stretchBias * 0.4);
    const c1y = cy + dy * 0.28 + py * (j1 + stretchBias * 0.4);
    const c2x = cx + dx * 0.60 + px * (j2 + stretchBias * 0.6);
    const c2y = cy + dy * 0.60 + py * (j2 + stretchBias * 0.6);
    return `M ${cx} ${cy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${nx} ${ny}`;
  };

  const dashOff = (tick * 2.0) % 36;

  // ── Core ──────────────────────────────────────────────────────────────────
  const corePulse = allPassed
    ? 1 + Math.sin(tick * 0.14) * 0.10
    : running
    ? 1 + Math.sin(tick * 0.07) * 0.04
    : 1;
  const coreStroke = allPassed ? "#4ade80" : "#38bdf8";
  const coreText   = allPassed ? "#4ade80" : "#7dd3fc";

  const PARTICLE_COLORS = ["#22c55e","#4ade80","#86efac","#22d3ee","#7dd3fc","#facc15","#a78bfa","#f472b6","#fb923c"];

  return (
    <div className="relative flex flex-col items-center select-none">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: "visible" }}>
        <defs>
          <radialGradient id="coreG4" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor={allPassed ? "#22c55e" : "#0ea5e9"} stopOpacity="0.9" />
            <stop offset="55%"  stopColor={allPassed ? "#15803d" : "#0369a1"} stopOpacity="0.35" />
            <stop offset="100%" stopColor="#020617" stopOpacity="0" />
          </radialGradient>
          <filter id="gF4" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="4" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="sgF4" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="10" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="nF4" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="arcF4" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.5" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* ── Explosion rings ── */}
        {exploding && [0,1,2,3,4].map(i => {
          const prog = Math.max(0, (explodeTick - i * 10) / 65);
          if (prog <= 0) return null;
          return (
            <circle key={i} cx={cx} cy={cy}
              r={coreR * (1.2 + prog * (4 + i * 1.5))}
              fill="none"
              stroke={i % 2 === 0 ? "#22c55e" : "#4ade80"}
              strokeWidth={2.5 - i * 0.3}
              strokeOpacity={Math.max(0, 1 - prog * 1.1)}
              filter="url(#gF4)"
            />
          );
        })}

        {/* ── Explosion particles ── */}
        {exploding && Array.from({ length: 56 }, (_, i) => {
          const angle = (i / 56) * Math.PI * 2 + sr(i) * 0.5;
          const speed = 0.7 + sr(i * 7) * 1.6;
          const prog  = Math.min(1, explodeTick / 75);
          const dist  = speed * prog * orbitR * 1.05;
          const fade  = prog > 0.45 ? 1 - (prog - 0.45) / 0.55 : 1;
          return (
            <circle key={i}
              cx={cx + Math.cos(angle) * dist}
              cy={cy + Math.sin(angle) * dist}
              r={(2 + sr(i * 13) * 5) * (1 - prog * 0.4)}
              fill={PARTICLE_COLORS[i % PARTICLE_COLORS.length]}
              fillOpacity={fade * 0.92}
              filter="url(#nF4)"
            />
          );
        })}

        {/* ── Electric tethers — ALL orbs, always connected ── */}
        {nodes.map((node, i) => {
          const state = getState(node.id);
          const { glow, pulse } = orbColor(state);
          const isPass   = state === "pass";
          const isActive = state === "active";
          const isPend   = state === "pending";
          const arcPath  = buildTether(node.x, node.y, i);

          return (
            <g key={`tether-${node.id}`}>
              {/* Outer glow arc */}
              <path d={arcPath} fill="none"
                stroke={glow}
                strokeWidth={isPass ? 2.5 : isActive ? 2.0 : 1.2}
                strokeOpacity={isPass ? 0.35 : isActive ? 0.45 : 0.15}
                strokeLinecap="round"
                filter="url(#arcF4)"
              />
              {/* Core arc line */}
              <path d={arcPath} fill="none"
                stroke={glow}
                strokeWidth={isPass ? 1.4 : isActive ? 1.2 : 0.7}
                strokeOpacity={isPass ? 0.70 : isActive ? 0.80 : 0.30}
                strokeLinecap="round"
              />
              {/* Animated energy pulse — always running */}
              <path d={arcPath} fill="none"
                stroke={pulse}
                strokeWidth={isPass ? 2.0 : isActive ? 2.2 : 1.0}
                strokeOpacity={isPass ? 0.60 : isActive ? 0.90 : 0.22}
                strokeDasharray={isPend ? "2 22" : "5 13"}
                strokeDashoffset={-(dashOff + i * 4.5)}
                strokeLinecap="round"
              />
            </g>
          );
        })}

        {/* ── Core brain ── */}
        <circle cx={cx} cy={cy} r={coreR * 2.5 * corePulse}
          fill="url(#coreG4)"
          filter={allPassed ? "url(#sgF4)" : undefined}
        />
        <circle cx={cx} cy={cy} r={coreR * corePulse}
          fill="none" stroke={coreStroke} strokeWidth="2" strokeOpacity="0.85"
          strokeDasharray={running || allPassed ? "5 5" : "none"}
          strokeDashoffset={allPassed ? dashOff * 3 : -dashOff * 2}
          filter="url(#gF4)"
        />
        <circle cx={cx} cy={cy} r={coreR * 0.74 * corePulse}
          fill={allPassed ? "#052e16" : "#061828"}
          stroke={coreStroke} strokeWidth="1" strokeOpacity="0.7"
        />
        <circle cx={cx} cy={cy} r={coreR * 0.50 * corePulse}
          fill="none"
          stroke={allPassed ? "#4ade80" : "#38bdf8"}
          strokeWidth="0.8" strokeOpacity="0.5"
          strokeDasharray="3 5"
          strokeDashoffset={dashOff * (allPassed ? 5 : 3)}
        />
        {allPassed && Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2 + tick * 0.016;
          return (
            <line key={i}
              x1={cx + coreR * 1.1 * corePulse * Math.cos(a)}
              y1={cy + coreR * 1.1 * corePulse * Math.sin(a)}
              x2={cx + coreR * 1.65 * corePulse * Math.cos(a)}
              y2={cy + coreR * 1.65 * corePulse * Math.sin(a)}
              stroke="#4ade80" strokeWidth="1.5" strokeOpacity="0.65"
              filter="url(#gF4)"
            />
          );
        })}
        <text x={cx} y={cy - 7} textAnchor="middle" dominantBaseline="middle"
          fill={coreText} fontSize={size * 0.027}
          fontFamily="'JetBrains Mono', monospace" fontWeight="700" letterSpacing="2"
        >ORION</text>
        <text x={cx} y={cy + 8} textAnchor="middle" dominantBaseline="middle"
          fill={allPassed ? "#22c55e" : running ? "#38bdf8" : "#334155"}
          fontSize={size * 0.016}
          fontFamily="'JetBrains Mono', monospace" letterSpacing="1" opacity="0.9"
        >
          {allPassed ? "TRADE OK" : stagesPassed > 0 ? `${stagesPassed}/14` : "STANDBY"}
        </text>

        {/* ── Orbs ── */}
        {nodes.map((node) => {
          const state = getState(node.id);
          const { fill, stroke, glow } = orbColor(state);
          const isLit  = state === "pass" || state === "active";
          const isFail = state === "fail";

          return (
            <g key={`orb-${node.id}`} filter={isLit || isFail ? "url(#nF4)" : undefined}>
              {isLit && (
                <circle cx={node.x} cy={node.y} r={nodeR * 1.55}
                  fill="none" stroke={glow} strokeWidth="1"
                  strokeOpacity={state === "active" ? 0.80 : 0.35}
                  strokeDasharray={state === "active" ? "3 3" : "none"}
                  strokeDashoffset={-dashOff}
                />
              )}
              <circle cx={node.x} cy={node.y} r={nodeR}
                fill={fill} fillOpacity={0.90}
                stroke={stroke} strokeWidth={state === "active" ? 2.2 : 1.6}
                strokeOpacity={0.92}
              />
              {/* Specular highlight */}
              <circle
                cx={node.x - nodeR * 0.22} cy={node.y - nodeR * 0.22}
                r={nodeR * 0.22} fill="white" fillOpacity={0.16}
              />
              <text x={node.x} y={node.y - 0.5}
                textAnchor="middle" dominantBaseline="middle"
                fill="#fff" fontSize={size * 0.022}
                fontFamily="'JetBrains Mono', monospace" fontWeight="700" fillOpacity={0.95}
              >{node.short}</text>
              <text x={node.x} y={node.y + nodeR + 11}
                textAnchor="middle" dominantBaseline="middle"
                fill={stroke} fontSize={size * 0.014}
                fontFamily="'JetBrains Mono', monospace" fillOpacity={0.65}
              >{String(node.id).padStart(2, "0")}</text>
            </g>
          );
        })}
      </svg>

      {/* ── Legend ── */}
      <div className="mt-1 grid grid-cols-7 gap-x-3 gap-y-1 w-full max-w-[480px] px-2">
        {STAGES.map((stage) => {
          const state = getState(stage.id);
          return (
            <div key={stage.id} className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                state === "pass"   ? "bg-green-400" :
                state === "active" ? "bg-orange-400" :
                state === "fail"   ? "bg-red-400" :
                "bg-orange-900"
              }`} />
              <span className={`text-[9px] font-mono tracking-wide truncate ${
                state === "pass"   ? "text-green-400" :
                state === "active" ? "text-orange-400" :
                state === "fail"   ? "text-red-400" :
                "text-orange-900"
              }`}>{stage.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
