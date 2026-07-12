import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import OrionLayout from "./components/OrionLayout";
import { lazy, Suspense } from "react";

// Lazy-load all pages to keep the initial bundle small
const HomePage = lazy(() => import("./pages/Home"));
const ObservatoryPage = lazy(() => import("./pages/Observatory"));
const MarketStructurePage = lazy(() => import("./pages/MarketStructure"));
const ModelsPage = lazy(() => import("./pages/Models"));
const BrainPage = lazy(() => import("./pages/Brain"));
const ADEPage = lazy(() => import("./pages/ADE"));
const ARIPage = lazy(() => import("./pages/ARI"));
const TVLPage = lazy(() => import("./pages/TVL"));
const ExecutionPage = lazy(() => import("./pages/Execution"));
const PositionPage = lazy(() => import("./pages/Position"));
const TimelinePage = lazy(() => import("./pages/Timeline"));
const ReplayPage = lazy(() => import("./pages/Replay"));
const JournalPage = lazy(() => import("./pages/Journal"));
const HealthPage = lazy(() => import("./pages/Health"));
const ReportsPage = lazy(() => import("./pages/Reports"));
const AIPage = lazy(() => import("./pages/AI"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const AnalyticsPage = lazy(() => import("./pages/Analytics"));
const CertificationPage = lazy(() => import("./pages/Certification"));
const ExecutionProfilesPage = lazy(() => import("./pages/ExecutionProfiles"));
const SB1ObservatoryPage = lazy(() => import("./pages/SB1Observatory"));
const DailyReviewPage = lazy(() => import("./pages/DailyReview"));
const SchedulerPage = lazy(() => import("./pages/Scheduler"));
const ARDObservatoryPage = lazy(() => import("./pages/ARDObservatory"));
const AtlasMemoryPage = lazy(() => import("./pages/AtlasMemory"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[200px]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--arc-blue)] border-t-transparent animate-spin" />
        <span className="text-xs tracking-widest text-[var(--color-muted-foreground)] font-['JetBrains_Mono']">LOADING MODULE…</span>
      </div>
    </div>
  );
}

function Router() {
  return (
    <OrionLayout>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/observatory" component={ObservatoryPage} />
          <Route path="/market-structure" component={MarketStructurePage} />
          <Route path="/models" component={ModelsPage} />
          <Route path="/brain" component={BrainPage} />
          <Route path="/ade" component={ADEPage} />
          <Route path="/ari" component={ARIPage} />
          <Route path="/tvl" component={TVLPage} />
          <Route path="/execution" component={ExecutionPage} />
          <Route path="/position" component={PositionPage} />
          <Route path="/timeline" component={TimelinePage} />
          <Route path="/replay" component={ReplayPage} />
          <Route path="/journal" component={JournalPage} />
          <Route path="/health" component={HealthPage} />
          <Route path="/reports" component={ReportsPage} />
          <Route path="/ai" component={AIPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/analytics" component={AnalyticsPage} />
          <Route path="/certification" component={CertificationPage} />
          <Route path="/execution-profiles" component={ExecutionProfilesPage} />
          <Route path="/sb1" component={SB1ObservatoryPage} />
          <Route path="/daily-review" component={DailyReviewPage} />
          <Route path="/scheduler" component={SchedulerPage} />
          <Route path="/ard" component={ARDObservatoryPage} />
          <Route path="/atlas-memory" component={AtlasMemoryPage} />
          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </OrionLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
