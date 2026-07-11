/**
 * ORION PIPELINE ORB — v3
 * 14 orbs float freely in space, each tethered to the ORION core brain.
 * All orbs start orange. They turn green one by one as each stage passes.
 * When all 14 go green the core explodes.
 */
import { useEffect, useRef, useState } from "react";

// ─── Stage definitions ────────────────────────────────────────────────────────
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

// ─── Seeded pseudo-random ─────────────────────────────────────────────────────
function sr(seed: number) {
  const x = Math.sin(seed + 1) * 43758.5453;
  return x - Math.floor(x);
}

// ─── Types ────────────────────────────────────────────────────────────────────
type NodeState = "pending" | "active" | "pass" | "fail";

interface PipelineOrbProps {
  stagesPassed?: number;
  failedStage?: number | null;
  running?: boolean;
  tradeApproved?: boolean;
  lastRun?: string | null;
  size?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────
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

  // ── Continuous animation tick ──────────────────────────────────────────────
  const [tick, setTick] = useState(0);
  const rafRef  = useRef<number | null>(null);
  const lastTs  = useRef(0);
  useEffect(() => {
    const loop = (ts: number) => {
      if (ts - lastTs.current > 16) {
        setTick(t => t + 1);
        lastTs.current = ts;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  // ── Explosion state ────────────────────────────────────────────────────────
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
        if (t > 100) {
          setExplodeTick(-1);
          if (explodeTimer.current) clearInterval(explodeTimer.current);
        }
      }, 18);
    }
    return () => { if (explodeTimer.current) clearInterval(explodeTimer.current); };
  }, [allPassed, lastRun]);

  const exploding = explodeTick >= 0;

  // ── Node state helper ──────────────────────────────────────────────────────
  const getState = (id: number): NodeState => {
    if (failedStage === id) return "fail";
    if (id <= stagesPassed) return "pass";
    if (running && id === stagesPassed + 1) return "active";
    return "pending";
  };

  // Colour: orange when pending/active, green when pass, red when fail
  const orbColor = (state: NodeState) => {
    switch (state) {
      case "pass":    return { fill: "#16a34a", stroke: "#4ade80", glow: "#22c55e" };
      case "active":  return { fill: "#c2410c", stroke: "#fb923c", glow: "#f97316" };
      case "fail":    return { fill: "#991b1b", stroke: "#ef4444", glow: "#ef4444" };
      default:        return { fill: "#92400e", stroke: "#f97316", glow: "#fb923c" };
    }
  };

  // ── Floating positions ─────────────────────────────────────────────────────
  // Each node has a base angle, then drifts on its own slow sinusoidal path
  const time = tick * 0.007;
  const nodes = STAGES.map((stage, i) => {
    const baseAngle = (i / STAGES.length) * Math.PI * 2 - Math.PI / 2;
    // Radial drift: each node breathes in/out at its own frequency
    const rFreq  = 0.15 + sr(i * 3) * 0.18;
    const rPhase = sr(i * 7) * Math.PI * 2;
    const rAmp   = orbitR * 0.07;
    // Angular drift: each node wanders slightly around its base angle
    const aFreq  = 0.10 + sr(i * 5) * 0.12;
    const aPhase = sr(i * 11) * Math.PI * 2;
    const aAmp   = 0.10;
    const r = orbitR + Math.sin(time * rFreq + rPhase) * rAmp;
    const a = baseAngle + Math.sin(time * aFreq + aPhase) * aAmp;
    // Subtle vertical bob
    const bobFreq  = 0.20 + sr(i * 13) * 0.15;
    const bobPhase = sr(i * 17) * Math.PI * 2;
    const bobAmp   = nodeR * 0.18;
    const bob = Math.sin(time * bobFreq + bobPhase) * bobAmp;
    return {
      ...stage,
      x: cx + r * Math.cos(a),
      y: cy + r * Math.sin(a) + bob,
    };
  });

  // ── Animated dash offset for tether pulse ─────────────────────────────────
  const dashOff = (tick * 1.6) % 36;

  // ── Core appearance ────────────────────────────────────────────────────────
  const corePulse = allPassed
    ? 1 + Math.sin(tick * 0.14) * 0.10
    : running
    ? 1 + Math.sin(tick * 0.07) * 0.04
    : 1;

  const coreStroke = allPassed ? "#4ade80" : "#38bdf8";
  const coreText   = allPassed ? "#4ade80" : "#7dd3fc";

  // ── Explosion particles ────────────────────────────────────────────────────
  const PARTICLE_COUNT = 56;
  const particleColors = ["#22c55e","#4ade80","#86efac","#22d3ee","#7dd3fc","#facc15","#a78bfa","#f472b6","#fb923c"];

  return (
    <div className="relative flex flex-col items-center select-none">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ overflow: "visible" }}
      >
        <defs>
          {/* Core radial glow */}
          <radialGradient id="coreG" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor={allPassed ? "#22c55e" : "#0ea5e9"} stopOpacity="0.9" />
            <stop offset="50%"  stopColor={allPassed ? "#15803d" : "#0369a1"} stopOpacity="0.4" />
            <stop offset="100%" stopColor="#020617" stopOpacity="0" />
          </radialGradient>
          {/* Soft glow filter */}
          <filter id="gF" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="4" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          {/* Strong glow for explosion */}
          <filter id="sgF" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="9" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          {/* Node glow */}
          <filter id="nF" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* ── Faint orbit guide ── */}
        <circle cx={cx} cy={cy} r={orbitR}
          fill="none" stroke="#1e3a5f" strokeWidth="0.5" strokeOpacity="0.4"
          strokeDasharray="2 10" />

        {/* ── Explosion rings ── */}
        {exploding && [0,1,2,3,4].map(i => {
          const prog = Math.max(0, (explodeTick - i * 10) / 65);
          if (prog <= 0) return null;
          const r = coreR * (1.2 + prog * (4 + i * 1.5));
          const op = Math.max(0, 1 - prog * 1.1);
          return (
            <circle key={i} cx={cx} cy={cy} r={r}
              fill="none"
              stroke={i % 2 === 0 ? "#22c55e" : "#4ade80"}
              strokeWidth={2.5 - i * 0.3}
              strokeOpacity={op}
              filter="url(#gF)"
            />
          );
        })}

        {/* ── Explosion particles ── */}
        {exploding && Array.from({ length: PARTICLE_COUNT }, (_, i) => {
          const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + sr(i) * 0.5;
          const speed = 0.7 + sr(i * 7) * 1.6;
          const prog  = Math.min(1, explodeTick / 75);
          const dist  = speed * prog * orbitR * 1.05;
          const fade  = prog > 0.45 ? 1 - (prog - 0.45) / 0.55 : 1;
          const pSize = 2 + sr(i * 13) * 5;
          return (
            <circle key={i}
              cx={cx + Math.cos(angle) * dist}
              cy={cy + Math.sin(angle) * dist}
              r={pSize * (1 - prog * 0.4)}
              fill={particleColors[i % particleColors.length]}
              fillOpacity={fade * 0.92}
              filter="url(#nF)"
            />
          );
        })}

        {/* ── Tethers (lines from core to each node) ── */}
        {nodes.map((node, i) => {
          const state = getState(node.id);
          const { glow } = orbColor(state);
          const isLit = state === "pass" || state === "active";
          return (
            <g key={`tether-${node.id}`}>
              {/* Base tether */}
              <line
                x1={cx} y1={cy} x2={node.x} y2={node.y}
                stroke={isLit ? glow : "#1e3a5f"}
                strokeWidth={isLit ? 1.2 : 0.6}
                strokeOpacity={isLit ? 0.45 : 0.25}
              />
              {/* Animated energy pulse along tether */}
              {isLit && (
                <line
                  x1={cx} y1={cy} x2={node.x} y2={node.y}
                  stroke={state === "pass" ? "#4ade80" : "#fb923c"}
                  strokeWidth={1.8}
                  strokeOpacity={0.55}
                  strokeDasharray="5 18"
                  strokeDashoffset={-(dashOff + i * 3.5)}
                  strokeLinecap="round"
                />
              )}
            </g>
          );
        })}

        {/* ── Core brain ── */}
        {/* Outer halo */}
        <circle cx={cx} cy={cy} r={coreR * 2.4 * corePulse}
          fill="url(#coreG)"
          filter={allPassed ? "url(#sgF)" : undefined}
        />
        {/* Main ring */}
        <circle cx={cx} cy={cy} r={coreR * corePulse}
          fill="none"
          stroke={coreStroke}
          strokeWidth="2"
          strokeOpacity="0.85"
          strokeDasharray={running || allPassed ? "5 5" : "none"}
          strokeDashoffset={allPassed ? dashOff * 3 : -dashOff * 2}
          filter="url(#gF)"
        />
        {/* Inner fill */}
        <circle cx={cx} cy={cy} r={coreR * 0.74 * corePulse}
          fill={allPassed ? "#052e16" : "#061828"}
          stroke={coreStroke}
          strokeWidth="1"
          strokeOpacity="0.7"
        />
        {/* Inner spinning ring */}
        <circle cx={cx} cy={cy} r={coreR * 0.50 * corePulse}
          fill="none"
          stroke={allPassed ? "#4ade80" : "#38bdf8"}
          strokeWidth="0.8"
          strokeOpacity="0.5"
          strokeDasharray="3 5"
          strokeDashoffset={dashOff * (allPassed ? 5 : 3)}
        />
        {/* Star-burst rays when all pass */}
        {allPassed && Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2 + tick * 0.016;
          return (
            <line key={i}
              x1={cx + coreR * 1.1 * corePulse * Math.cos(a)}
              y1={cy + coreR * 1.1 * corePulse * Math.sin(a)}
              x2={cx + coreR * 1.6 * corePulse * Math.cos(a)}
              y2={cy + coreR * 1.6 * corePulse * Math.sin(a)}
              stroke="#4ade80" strokeWidth="1.5" strokeOpacity="0.65"
              filter="url(#gF)"
            />
          );
        })}
        {/* Core text */}
        <text x={cx} y={cy - 7} textAnchor="middle" dominantBaseline="middle"
          fill={coreText}
          fontSize={size * 0.027}
          fontFamily="'JetBrains Mono', monospace"
          fontWeight="700" letterSpacing="2"
        >
          ORION
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" dominantBaseline="middle"
          fill={allPassed ? "#22c55e" : running ? "#38bdf8" : "#334155"}
          fontSize={size * 0.016}
          fontFamily="'JetBrains Mono', monospace"
          letterSpacing="1" opacity="0.9"
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
            <g key={`orb-${node.id}`} filter={isLit || isFail ? "url(#nF)" : undefined}>
              {/* Outer glow ring */}
              {isLit && (
                <circle cx={node.x} cy={node.y} r={nodeR * 1.55}
                  fill="none"
                  stroke={glow}
                  strokeWidth="1"
                  strokeOpacity={state === "active" ? 0.8 : 0.35}
                  strokeDasharray={state === "active" ? "3 3" : "none"}
                  strokeDashoffset={-dashOff}
                />
              )}
              {/* Orb body */}
              <circle cx={node.x} cy={node.y} r={nodeR}
                fill={fill}
                fillOpacity={0.88}
                stroke={stroke}
                strokeWidth={state === "active" ? 2.2 : 1.5}
                strokeOpacity={0.9}
              />
              {/* Inner highlight dot */}
              <circle
                cx={node.x - nodeR * 0.22}
                cy={node.y - nodeR * 0.22}
                r={nodeR * 0.22}
                fill="white"
                fillOpacity={0.18}
              />
              {/* Label */}
              <text
                x={node.x} y={node.y - 0.5}
                textAnchor="middle" dominantBaseline="middle"
                fill="#fff"
                fontSize={size * 0.022}
                fontFamily="'JetBrains Mono', monospace"
                fontWeight="700"
                fillOpacity={0.95}
              >
                {node.short}
              </text>
              {/* Stage number below orb */}
              <text
                x={node.x} y={node.y + nodeR + 11}
                textAnchor="middle" dominantBaseline="middle"
                fill={stroke}
                fontSize={size * 0.014}
                fontFamily="'JetBrains Mono', monospace"
                fillOpacity={0.7}
              >
                {String(node.id).padStart(2, "0")}
              </text>
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
