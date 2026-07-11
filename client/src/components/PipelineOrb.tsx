/**
 * ORION PIPELINE ORB
 * 14 pipeline stages orbit the central ORION core.
 * Electric pulse arcs connect each node to the core.
 * Nodes light up sequentially as each pipeline stage passes.
 */
import { useEffect, useRef, useState } from "react";

// ─── Pipeline Stage Definitions ───────────────────────────────────────────────

const STAGES = [
  { id: 1,  label: "CONFIG",    module: "M-00", short: "CFG",  color: "#22d3ee" },
  { id: 2,  label: "STATE",     module: "M-00", short: "STA",  color: "#22d3ee" },
  { id: 3,  label: "MARKET",    module: "M-03", short: "MKT",  color: "#38bdf8" },
  { id: 4,  label: "MODEL A1",  module: "M-04", short: "A1",   color: "#818cf8" },
  { id: 5,  label: "MODEL A3",  module: "M-05", short: "A3",   color: "#818cf8" },
  { id: 6,  label: "MODEL B1",  module: "M-06", short: "B1",   color: "#818cf8" },
  { id: 7,  label: "ADE",       module: "M-07", short: "ADE",  color: "#f472b6" },
  { id: 8,  label: "ARI",       module: "M-08", short: "ARI",  color: "#fb923c" },
  { id: 9,  label: "TVL",       module: "M-09", short: "TVL",  color: "#facc15" },
  { id: 10, label: "EXECUTION", module: "M-10", short: "EXE",  color: "#4ade80" },
  { id: 11, label: "OBSERVE",   module: "M-11", short: "OBS",  color: "#34d399" },
  { id: 12, label: "BRAIN",     module: "M-12", short: "BRN",  color: "#a78bfa" },
  { id: 13, label: "MISSION",   module: "M-13", short: "MIS",  color: "#60a5fa" },
  { id: 14, label: "HEARTBEAT", module: "M-14", short: "HBT",  color: "#22d3ee" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type NodeState = "idle" | "active" | "pass" | "fail" | "blocked";

interface PipelineOrbProps {
  // How many stages have passed (0–14). Drives the green activation.
  stagesPassed?: number;
  // Which stage index (1-based) failed, if any
  failedStage?: number | null;
  // Whether the pipeline is currently running (triggers animation)
  running?: boolean;
  // Whether a trade was approved at the end
  tradeApproved?: boolean;
  // Last pipeline run timestamp
  lastRun?: string | null;
  // Size of the component
  size?: number;
}

// ─── Electric Arc Helper ──────────────────────────────────────────────────────

function buildArcPath(
  cx: number, cy: number,
  nx: number, ny: number,
  seed: number
): string {
  const dx = nx - cx;
  const dy = ny - cy;
  const mx = cx + dx * 0.5;
  const my = cy + dy * 0.5;
  const len = Math.sqrt(dx * dx + dy * dy);
  const perp = { x: -dy / len, y: dx / len };
  // Jitter control points for lightning-bolt feel
  const j1 = (Math.sin(seed * 7.3) * 0.5 + 0.5) * 18 - 9;
  const j2 = (Math.sin(seed * 13.7) * 0.5 + 0.5) * 14 - 7;
  const c1x = mx + perp.x * j1 + dx * -0.15;
  const c1y = my + perp.y * j1 + dy * -0.15;
  const c2x = mx + perp.x * j2 + dx * 0.15;
  const c2y = my + perp.y * j2 + dy * 0.15;
  return `M ${cx} ${cy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${nx} ${ny}`;
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
  const [tick, setTick] = useState(0);
  const [activeArc, setActiveArc] = useState<number | null>(null);
  const [pulseRing, setPulseRing] = useState(false);
  const animRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);

  // Animate arcs and pulse ring
  useEffect(() => {
    let frame: number;
    const animate = (ts: number) => {
      if (ts - lastTickRef.current > 60) {
        setTick(t => t + 1);
        lastTickRef.current = ts;
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  // When running, cycle the active arc through passed stages
  useEffect(() => {
    if (!running || stagesPassed === 0) {
      setActiveArc(null);
      return;
    }
    const interval = setInterval(() => {
      setActiveArc(prev => {
        if (prev === null) return 0;
        return (prev + 1) % stagesPassed;
      });
    }, 120);
    return () => clearInterval(interval);
  }, [running, stagesPassed]);

  // Pulse ring on trade approved
  useEffect(() => {
    if (tradeApproved) {
      setPulseRing(true);
      const t = setTimeout(() => setPulseRing(false), 2000);
      return () => clearTimeout(t);
    }
  }, [tradeApproved, lastRun]);

  const cx = size / 2;
  const cy = size / 2;
  const orbitR = size * 0.38;
  const coreR = size * 0.10;
  const nodeR = size * 0.055;

  // Compute node positions evenly around the orbit
  const nodes = STAGES.map((stage, i) => {
    const angle = (i / STAGES.length) * 2 * Math.PI - Math.PI / 2;
    return {
      ...stage,
      x: cx + orbitR * Math.cos(angle),
      y: cy + orbitR * Math.sin(angle),
      angle,
    };
  });

  // Determine node state
  const getState = (stageId: number): NodeState => {
    if (failedStage === stageId) return "fail";
    if (failedStage !== null && stageId > failedStage) return "blocked";
    if (stageId <= stagesPassed) return "pass";
    if (running && stageId === stagesPassed + 1) return "active";
    return "idle";
  };

  const stateColor = (state: NodeState, baseColor: string) => {
    switch (state) {
      case "pass":    return "#22c55e";
      case "active":  return "#facc15";
      case "fail":    return "#ef4444";
      case "blocked": return "#374151";
      default:        return baseColor + "55";
    }
  };

  const stateGlow = (state: NodeState) => {
    switch (state) {
      case "pass":    return "0 0 12px #22c55e, 0 0 24px #22c55e55";
      case "active":  return "0 0 16px #facc15, 0 0 32px #facc1555";
      case "fail":    return "0 0 12px #ef4444, 0 0 24px #ef444455";
      default:        return "none";
    }
  };

  // Arc color for a given node state
  const arcColor = (state: NodeState, baseColor: string) => {
    if (state === "pass") return "#22c55e";
    if (state === "active") return "#facc15";
    if (state === "fail") return "#ef4444";
    return baseColor + "22";
  };

  // Animated dash offset for electric pulse
  const dashOffset = (tick * 2) % 40;

  const allPassed = stagesPassed === 14;

  return (
    <div className="relative flex flex-col items-center select-none">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ overflow: "visible" }}
      >
        <defs>
          {/* Radial gradient for core */}
          <radialGradient id="coreGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor={allPassed ? "#22c55e" : tradeApproved ? "#22c55e" : "#0ea5e9"} stopOpacity="0.9" />
            <stop offset="60%"  stopColor={allPassed ? "#15803d" : "#0369a1"} stopOpacity="0.6" />
            <stop offset="100%" stopColor="#020617" stopOpacity="0.0" />
          </radialGradient>
          {/* Orbit ring gradient */}
          <radialGradient id="orbitGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#0ea5e9" stopOpacity="0.0" />
            <stop offset="85%"  stopColor="#0ea5e9" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.0" />
          </radialGradient>
          {/* Glow filter */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="strongGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ── Outer decorative rings ── */}
        <circle cx={cx} cy={cy} r={orbitR + nodeR + 8}
          fill="none" stroke="#0ea5e9" strokeWidth="0.5" strokeOpacity="0.12"
          strokeDasharray="4 8" />
        <circle cx={cx} cy={cy} r={orbitR - nodeR - 8}
          fill="none" stroke="#0ea5e9" strokeWidth="0.5" strokeOpacity="0.08"
          strokeDasharray="2 12" />

        {/* ── Orbit ring fill ── */}
        <circle cx={cx} cy={cy} r={orbitR}
          fill="url(#orbitGrad)" stroke="#0ea5e9" strokeWidth="0.5" strokeOpacity="0.15" />

        {/* ── Trade approved pulse ring ── */}
        {pulseRing && (
          <>
            <circle cx={cx} cy={cy} r={orbitR + 20}
              fill="none" stroke="#22c55e" strokeWidth="2" strokeOpacity="0.6"
              style={{ animation: "ping 1s ease-out forwards" }} />
            <circle cx={cx} cy={cy} r={orbitR + 40}
              fill="none" stroke="#22c55e" strokeWidth="1" strokeOpacity="0.3"
              style={{ animation: "ping 1.4s ease-out forwards" }} />
          </>
        )}

        {/* ── Electric arcs from core to each node ── */}
        {nodes.map((node, i) => {
          const state = getState(node.id);
          const isActiveArc = activeArc === i;
          const color = arcColor(state, node.color);
          const path = buildArcPath(cx, cy, node.x, node.y, i + tick * 0.03);
          const opacity = state === "idle" || state === "blocked" ? 0.12 : isActiveArc ? 1.0 : 0.55;

          return (
            <g key={`arc-${node.id}`}>
              {/* Base arc */}
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={state === "pass" ? 1.5 : 1}
                strokeOpacity={opacity}
                strokeLinecap="round"
              />
              {/* Animated pulse dash */}
              {(state === "pass" || state === "active") && (
                <path
                  d={path}
                  fill="none"
                  stroke={state === "active" ? "#facc15" : "#22c55e"}
                  strokeWidth={isActiveArc ? 2.5 : 1.5}
                  strokeOpacity={isActiveArc ? 0.9 : 0.4}
                  strokeDasharray="6 14"
                  strokeDashoffset={-dashOffset + i * 5}
                  strokeLinecap="round"
                />
              )}
            </g>
          );
        })}

        {/* ── Central core ── */}
        {/* Core glow halo */}
        <circle cx={cx} cy={cy} r={coreR * 1.8}
          fill="url(#coreGrad)" />
        {/* Core outer ring */}
        <circle cx={cx} cy={cy} r={coreR}
          fill="none"
          stroke={allPassed ? "#22c55e" : "#0ea5e9"}
          strokeWidth="1.5"
          strokeOpacity="0.7"
          strokeDasharray={running ? "4 4" : "none"}
          strokeDashoffset={-dashOffset * 2}
          filter="url(#glow)"
        />
        {/* Core inner fill */}
        <circle cx={cx} cy={cy} r={coreR * 0.75}
          fill={allPassed ? "#052e16" : "#0c1a2e"}
          stroke={allPassed ? "#22c55e" : "#38bdf8"}
          strokeWidth="1"
          strokeOpacity="0.8"
        />
        {/* Core rotating inner ring */}
        <circle cx={cx} cy={cy} r={coreR * 0.55}
          fill="none"
          stroke={allPassed ? "#4ade80" : "#7dd3fc"}
          strokeWidth="0.8"
          strokeOpacity="0.5"
          strokeDasharray="3 6"
          strokeDashoffset={dashOffset * 3}
        />
        {/* Core label */}
        <text x={cx} y={cy - 6} textAnchor="middle" dominantBaseline="middle"
          fill={allPassed ? "#4ade80" : "#7dd3fc"}
          fontSize={size * 0.028}
          fontFamily="'JetBrains Mono', monospace"
          fontWeight="700"
          letterSpacing="2"
        >
          ORION
        </text>
        <text x={cx} y={cy + 9} textAnchor="middle" dominantBaseline="middle"
          fill={allPassed ? "#22c55e" : "#38bdf8"}
          fontSize={size * 0.018}
          fontFamily="'JetBrains Mono', monospace"
          letterSpacing="1"
          opacity="0.7"
        >
          {allPassed ? "TRADE OK" : running ? "RUNNING" : `${stagesPassed}/14`}
        </text>

        {/* ── Stage nodes ── */}
        {nodes.map((node) => {
          const state = getState(node.id);
          const fill = stateColor(state, node.color);
          const isPass = state === "pass";
          const isActive = state === "active";
          const isFail = state === "fail";

          return (
            <g key={`node-${node.id}`} filter={isPass || isActive || isFail ? "url(#glow)" : undefined}>
              {/* Node outer glow ring for pass/active */}
              {(isPass || isActive) && (
                <circle
                  cx={node.x} cy={node.y}
                  r={nodeR * 1.45}
                  fill="none"
                  stroke={isActive ? "#facc15" : "#22c55e"}
                  strokeWidth="1"
                  strokeOpacity={isActive ? 0.7 : 0.35}
                  strokeDasharray={isActive ? "3 3" : "none"}
                  strokeDashoffset={-dashOffset}
                />
              )}
              {/* Node body */}
              <circle
                cx={node.x} cy={node.y}
                r={nodeR}
                fill={fill}
                fillOpacity={state === "idle" || state === "blocked" ? 0.15 : 0.9}
                stroke={fill}
                strokeWidth={isActive ? 2 : 1}
                strokeOpacity={state === "idle" || state === "blocked" ? 0.2 : 0.9}
              />
              {/* Node inner dot */}
              <circle
                cx={node.x} cy={node.y}
                r={nodeR * 0.35}
                fill={state === "idle" || state === "blocked" ? "#1e293b" : fill}
                fillOpacity={state === "idle" || state === "blocked" ? 0.4 : 1}
              />
              {/* Stage short label */}
              <text
                x={node.x} y={node.y - 1}
                textAnchor="middle" dominantBaseline="middle"
                fill={state === "idle" || state === "blocked" ? "#475569" : "#fff"}
                fontSize={size * 0.022}
                fontFamily="'JetBrains Mono', monospace"
                fontWeight="600"
              >
                {node.short}
              </text>
              {/* Stage number badge */}
              <text
                x={node.x} y={node.y + nodeR + 10}
                textAnchor="middle" dominantBaseline="middle"
                fill={state === "idle" || state === "blocked" ? "#334155" : fill}
                fontSize={size * 0.016}
                fontFamily="'JetBrains Mono', monospace"
                opacity="0.8"
              >
                {node.id.toString().padStart(2, "0")}
              </text>
            </g>
          );
        })}

        {/* ── Tick marks on orbit ── */}
        {nodes.map((node, i) => {
          const angle = node.angle;
          const r1 = orbitR - nodeR - 14;
          const r2 = orbitR - nodeR - 8;
          return (
            <line key={`tick-${i}`}
              x1={cx + r1 * Math.cos(angle)} y1={cy + r1 * Math.sin(angle)}
              x2={cx + r2 * Math.cos(angle)} y2={cy + r2 * Math.sin(angle)}
              stroke="#0ea5e9" strokeWidth="0.5" strokeOpacity="0.2"
            />
          );
        })}
      </svg>

      {/* ── Stage legend strip ── */}
      <div className="mt-2 grid grid-cols-7 gap-x-3 gap-y-1 w-full max-w-[480px] px-2">
        {STAGES.map((stage) => {
          const state = getState(stage.id);
          const isPass = state === "pass";
          const isFail = state === "fail";
          const isActive = state === "active";
          return (
            <div key={stage.id} className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                isPass ? "bg-green-400" :
                isActive ? "bg-yellow-400" :
                isFail ? "bg-red-400" :
                "bg-slate-700"
              }`} />
              <span className={`text-[9px] font-mono tracking-wide truncate ${
                isPass ? "text-green-400" :
                isActive ? "text-yellow-400" :
                isFail ? "text-red-400" :
                "text-slate-600"
              }`}>
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes ping {
          0%   { transform-origin: ${size/2}px ${size/2}px; transform: scale(1); opacity: 0.8; }
          100% { transform-origin: ${size/2}px ${size/2}px; transform: scale(1.3); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
