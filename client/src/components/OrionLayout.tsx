/**
 * ORION — Quantitative Trading Operating System
 * Navigation shell with 14-page sidebar, JARVIS/arc-reactor aesthetic.
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  Activity, AlertTriangle, BadgeCheck, BarChart2, BookOpen, Brain, BrainCircuit, CalendarCheck, ChevronLeft, ChevronRight,
  Clock, Cpu, Database, FlaskConical, GitBranch, Home, LayoutDashboard, Layers, LineChart, Menu,
  Radio, Settings, Shield, Target, Telescope, TrendingUp, Zap,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";

// ─── Navigation items ─────────────────────────────────────────────────────────

const NAV_GROUPS = [
  {
    label: "COMMAND",
    items: [
      { icon: Home, label: "Home", path: "/" },
      { icon: LayoutDashboard, label: "Observatory", path: "/observatory" },
    ],
  },
  {
    label: "PIPELINE",
    items: [
      { icon: TrendingUp, label: "Market Structure", path: "/market-structure" },
      { icon: Brain, label: "Model Evaluations", path: "/models" },
      { icon: Cpu, label: "Atlas Brain", path: "/brain" },
      { icon: Zap, label: "ADE", path: "/ade" },
      { icon: BadgeCheck, label: "Certification", path: "/certification" },
      { icon: Shield, label: "ARI", path: "/ari" },
      { icon: AlertTriangle, label: "TVL", path: "/tvl" },
    ],
  },
  {
    label: "EXECUTION",
    items: [
      { icon: Activity, label: "Execution", path: "/execution" },
      { icon: Layers, label: "Exec Profiles", path: "/execution-profiles" },
      { icon: BarChart2, label: "Position State", path: "/position" },
      { icon: Clock, label: "Decision Timeline", path: "/timeline" },
      { icon: FlaskConical, label: "Replay Engine", path: "/replay" },
    ],
  },
  {
    label: "INTELLIGENCE",
    items: [
      { icon: BookOpen, label: "Trading Journal", path: "/journal" },
      { icon: LineChart, label: "Analytics", path: "/analytics" },
      { icon: Radio, label: "System Health", path: "/health" },
      { icon: Database, label: "Reports", path: "/reports" },
      { icon: Telescope, label: "Atlas AI", path: "/ai" },
      { icon: Settings, label: "Settings", path: "/settings" },
    ],
  },
  {
    label: "SB1 REGIME",
    items: [
      { icon: Target, label: "SB1 Observatory", path: "/sb1" },
      { icon: CalendarCheck, label: "Daily Review", path: "/daily-review" },
      { icon: Clock, label: "Scheduler", path: "/scheduler" },
    ],
  },
  {
    label: "ARD / ORACLE",
    items: [
      { icon: FlaskConical, label: "ARD Observatory", path: "/ard" },
      { icon: BrainCircuit, label: "Atlas Memory", path: "/atlas-memory" },
      { icon: GitBranch, label: "Temporal Intelligence", path: "/tie" },
    ],
  },
];

const SIDEBAR_WIDTH_KEY = "orion-sidebar-width";
const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 180;
const MAX_WIDTH = 360;

// ─── Main Layout ──────────────────────────────────────────────────────────────

export default function OrionLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "var(--hud-bg)" }}>
        <div className="flex flex-col items-center gap-4">
          <div className="arc-reactor-ring" style={{ width: 48, height: 48 }} />
          <span className="text-xs tracking-widest" style={{ color: "var(--arc-blue)", fontFamily: "var(--font-mono)" }}>INITIALISING ORION…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "var(--hud-bg)" }}>
        <div className="hud-panel hud-panel-br p-8 max-w-sm w-full flex flex-col items-center gap-6">
          <div className="arc-reactor-ring" style={{ width: 56, height: 56 }} />
          <div className="text-center">
            <div className="text-lg font-bold tracking-widest mb-1" style={{ color: "var(--arc-blue)", fontFamily: "var(--font-display)" }}>ORION</div>
            <div className="text-xs tracking-widest mb-4" style={{ color: "var(--color-muted-foreground)" }}>QUANTITATIVE TRADING OS</div>
            <p className="text-sm" style={{ color: "var(--color-muted-foreground)" }}>Authentication required to access the command interface.</p>
          </div>
          <button
            onClick={() => { window.location.href = getLoginUrl(); }}
            className="w-full py-2 px-4 text-sm font-semibold tracking-widest transition-all"
            style={{
              background: "oklch(0.18 0.08 220)",
              border: "1px solid var(--arc-blue)",
              color: "var(--arc-blue)",
              fontFamily: "var(--font-mono)",
              boxShadow: "0 0 12px oklch(0.65 0.22 220 / 0.3)",
            }}
          >
            AUTHENTICATE
          </button>
        </div>
      </div>
    );
  }

  const allItems = NAV_GROUPS.flatMap((g) => g.items);
  const activeItem = allItems.find((i) => i.path === location);

  const sidebarContent = (
    <nav
      ref={sidebarRef}
      style={{
        width: collapsed ? 56 : sidebarWidth,
        minWidth: collapsed ? 56 : MIN_WIDTH,
        maxWidth: collapsed ? 56 : MAX_WIDTH,
        background: "oklch(0.09 0.04 220)",
        borderRight: "1px solid oklch(0.22 0.08 220 / 0.6)",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "sticky",
        top: 0,
        flexShrink: 0,
        transition: isResizing ? "none" : "width 0.2s cubic-bezier(0.23,1,0.32,1)",
        zIndex: 40,
      }}
    >
      {/* Header */}
      <div style={{ height: 56, display: "flex", alignItems: "center", padding: "0 12px", borderBottom: "1px solid oklch(0.22 0.08 220 / 0.4)", gap: 10, flexShrink: 0 }}>
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", color: "var(--arc-blue)", flexShrink: 0 }}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
        {!collapsed && (
          <div style={{ overflow: "hidden" }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, letterSpacing: "0.15em", color: "var(--arc-blue)", lineHeight: 1.2, whiteSpace: "nowrap" }}>ORION</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-muted-foreground)", whiteSpace: "nowrap" }}>QUANT TRADING OS</div>
          </div>
        )}
      </div>

      {/* Nav items */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "8px 0" }}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.15em", color: "oklch(0.45 0.08 220)", padding: "10px 16px 4px", fontWeight: 600 }}>
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const isActive = location === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => { setLocation(item.path); if (isMobile) setMobileOpen(false); }}
                  title={collapsed ? item.label : undefined}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: collapsed ? "9px 0" : "9px 14px",
                    justifyContent: collapsed ? "center" : "flex-start",
                    background: isActive ? "oklch(0.14 0.06 220)" : "transparent",
                    border: "none",
                    borderLeft: isActive ? "2px solid var(--arc-blue)" : "2px solid transparent",
                    cursor: "pointer",
                    color: isActive ? "var(--arc-blue)" : "oklch(0.65 0.06 220)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    letterSpacing: "0.08em",
                    fontWeight: isActive ? 600 : 400,
                    transition: "all 0.15s ease",
                    textAlign: "left",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                  }}
                  onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "oklch(0.8 0.1 220)"; }}
                  onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "oklch(0.65 0.06 220)"; }}
                >
                  <item.icon size={14} style={{ flexShrink: 0 }} />
                  {!collapsed && <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Resize handle */}
      {!collapsed && (
        <div
          style={{ position: "absolute", top: 0, right: 0, width: 4, height: "100%", cursor: "col-resize", zIndex: 50 }}
          onMouseDown={() => setIsResizing(true)}
        />
      )}
    </nav>
  );

  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--hud-bg)" }}>
        {/* Mobile top bar */}
        <div style={{ height: 48, display: "flex", alignItems: "center", padding: "0 12px", borderBottom: "1px solid oklch(0.22 0.08 220 / 0.4)", background: "oklch(0.09 0.04 220)", gap: 10, flexShrink: 0, position: "sticky", top: 0, zIndex: 50 }}>
          <button onClick={() => setMobileOpen((o) => !o)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--arc-blue)" }}>
            <Menu size={18} />
          </button>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700, letterSpacing: "0.15em", color: "var(--arc-blue)" }}>ORION</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)", marginLeft: 4 }}>{activeItem?.label}</span>
        </div>
        {/* Mobile drawer */}
        {mobileOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex" }}>
            <div style={{ flex: 1, background: "oklch(0 0 0 / 0.6)" }} onClick={() => setMobileOpen(false)} />
            <div style={{ width: 240, height: "100%", overflowY: "auto" }}>
              {sidebarContent}
            </div>
          </div>
        )}
        <main style={{ flex: 1, overflow: "auto" }}>{children}</main>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--hud-bg)" }}>
      {sidebarContent}
      <main style={{ flex: 1, overflow: "auto", minWidth: 0 }}>{children}</main>
    </div>
  );
}
