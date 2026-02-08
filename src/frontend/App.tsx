// App.tsx
import { createRoot } from 'react-dom/client';
import { HashRouter, Route, Routes, useParams } from 'react-router-dom';
import {
  TelemetryProvider,
  DashboardProvider,
  useDashboard,
  RunningStateProvider,
  useRunningState,
  SessionProvider,
  PitLaneProvider,
  useResetOnDisconnect,
  TeamSharingProvider,
  useTeamSharing,
} from '@irdashies/context';
import type { DashboardWidget } from '@irdashies/types';
import { Settings } from './components/Settings/Settings';
import { EditMode } from './components/EditMode/EditMode';
import { ThemeManager } from './components/ThemeManager/ThemeManager';
import { WIDGET_MAP } from './WidgetIndex';
import { HideUIWrapper } from './components/HideUIWrapper/HideUIWrapper';
import { TeamSharingAutoSync } from './components/TeamSharing/TeamSharingAutoSync';

const WidgetLoader = () => {
  const { widgetId } = useParams<{ widgetId: string }>();
  const { currentDashboard } = useDashboard();
  const { running } = useRunningState();
  const { mode } = useTeamSharing();
  useResetOnDisconnect(running);

  // console.log('[WidgetLoader] Rendering', { widgetId, hasDashboard: !!currentDashboard, mode });

  // Determine if we are a guest
  const isGuest = mode === 'guest';

  // Find the widget configuration
  const widget = currentDashboard?.widgets?.find((w) => w.id === widgetId);

  // GUEST FALLBACK: If we're a guest and either have no dashboard OR the widget is missing,
  // create a virtual one to ensure rendering.
  if (isGuest && widgetId && (!currentDashboard || !widget)) {
    const fallbackType = widgetId.includes('fuel')
      ? 'fuel'
      : widgetId.includes('standings')
        ? 'standings'
        : widgetId;
    // console.log('[WidgetLoader] Guest fallback triggered for:', { widgetId, fallbackType });

    const WidgetComponent = WIDGET_MAP[fallbackType as keyof typeof WIDGET_MAP];
    if (WidgetComponent)
      return (
        <WidgetComponent
          id={widgetId}
          type={fallbackType}
          enabled={true}
          config={{}}
          layout={{ x: 0, y: 0, width: 400, height: 300 }}
        />
      );
  }

  if (!currentDashboard || !widgetId) {
    return (
      <div className="flex h-screen w-screen items-center justify-center text-slate-500 text-sm">
        Loading config...
      </div>
    );
  }

  // If strict match failed, check for legacy mappings or loose matching
  let resolvedWidget = widget;
  if (!resolvedWidget) {
    if (
      widgetId.startsWith('fuel2') ||
      widgetId.startsWith('fuel-calculator')
    ) {
      resolvedWidget = currentDashboard.widgets.find(
        (w) => w.id === 'fuel' || w.type === 'fuel'
      );
      if (!resolvedWidget) {
        resolvedWidget = {
          id: widgetId,
          type: 'fuel',
          enabled: true,
          config: {},
        } as DashboardWidget;
      }
    }
  }

  if (!resolvedWidget) {
    return (
      <div className="flex h-screen w-screen items-center justify-center text-red-500 text-sm">
        Widget not found: {widgetId}
      </div>
    );
  }

  let componentType = resolvedWidget.type || resolvedWidget.id;
  if (
    componentType.startsWith('fuel2') ||
    componentType === 'fuel-calculator'
  ) {
    componentType = 'fuel';
  }

  const WidgetComponent = WIDGET_MAP[componentType];
  if (!WidgetComponent) {
    return (
      <div className="flex h-screen w-screen items-center justify-center text-red-500 text-sm">
        Component not found: {componentType}
      </div>
    );
  }

  // Render the widget - visibility is handled internally by the widget
  return <WidgetComponent {...resolvedWidget.config} />;
};

const AppRoutes = () => {
  console.log('[AppRoutes] Current path:', window.location.hash);
  return (
    <Routes>
      <Route path="/settings/*" element={<Settings />} />
      <Route path="/edit" element={<EditMode />} />
      <Route path="/:widgetId" element={<WidgetLoader />} />
      <Route
        path="/"
        element={<div className="text-white">Dashboard Root</div>}
      />
    </Routes>
  );
};

const App = () => {
  return (
    <DashboardProvider bridge={window.dashboardBridge}>
      <TeamSharingProvider>
        <TeamSharingAutoSync />
        <RunningStateProvider bridge={window.irsdkBridge}>
          <SessionProvider bridge={window.irsdkBridge} />
          <TelemetryProvider bridge={window.irsdkBridge} />
          <PitLaneProvider bridge={window.pitLaneBridge} />
          <HashRouter>
            <HideUIWrapper>
              <EditMode>
                <ThemeManager>
                  <AppRoutes />
                </ThemeManager>
              </EditMode>
            </HideUIWrapper>
          </HashRouter>
        </RunningStateProvider>
      </TeamSharingProvider>
    </DashboardProvider>
  );
};

const el = document.getElementById('app');
if (!el) {
  throw new Error('No #app element found');
}

export default App;

const root = createRoot(el);
root.render(<App />);
