import React, { useState } from 'react';
import { useTeamSharing } from '../../../context/TeamSharingContext';
import { teamSharingService } from '../../../services/TeamSharing/TeamSharingService';
import { useFuelStore } from '../../FuelCalculator/FuelStore';
import { useAutoTeamSync } from '../../../hooks/useAutoTeamSync';
import { useLocalIsTeamRacing } from '../../../context/TelemetryStore/LocalTelemetryStore';
import {
  Radio,
  Users,
  Link,
  StopCircle,
  CheckCircle2,
  Copy,
  Zap,
  AlertTriangle,
} from 'lucide-react';

export const TeamSharingSettings: React.FC = () => {
  const { mode, peerId, lastDataReceived, startHosting, joinSession, stop } =
    useTeamSharing();
  const { isEnabled: isAutoSync, toggleAutoSync } = useAutoTeamSync();
  const isTeamRacing = useLocalIsTeamRacing();
  const [targetId, setTargetId] = useState('');
  const getLapHistory = useFuelStore((state) => state.getLapHistory);
  const [now, setNow] = useState(() => Date.now());
  const [showDebug, setShowDebug] = useState(() => {
    return localStorage.getItem('p2p_debug_enabled') === 'true';
  });

  const toggleDebug = () => {
    const newVal = !showDebug;
    setShowDebug(newVal);
    localStorage.setItem('p2p_debug_enabled', String(newVal));
  };

  // Update clock every second for the "Last data" display
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleHost = () => {
    startHosting();
  };

  const handleSyncHistory = () => {
    if (mode === 'host') {
      const history = getLapHistory();
      teamSharingService.broadcastManual({
        type: 'fuel_history',
        data: history,
      });
    }
  };

  const copyId = () => {
    if (peerId) {
      navigator.clipboard.writeText(peerId);
    }
  };

  return (
    <div className="space-y-6 text-slate-200">
      <div className="flex items-center gap-3 border-b border-slate-700 pb-4">
        <Users className="h-6 w-6 text-blue-400" />
        <h2 className="text-xl font-bold font-display">
          Teammate Data Sharing
        </h2>
      </div>

      <div className="bg-blue-600/10 border border-blue-500/20 p-4 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Zap
              className={`h-5 w-5 ${isAutoSync ? 'text-yellow-400 fill-yellow-400' : 'text-slate-500'}`}
            />
            <div>
              <h4 className="font-bold text-sm">Automatic Team Sync</h4>
              <p className="text-xs text-slate-400">
                Auto-detect teammates and switch roles during driver swaps.
              </p>
            </div>
          </div>
          <button
            onClick={toggleAutoSync}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isAutoSync ? 'bg-blue-500' : 'bg-slate-700'}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isAutoSync ? 'translate-x-6' : 'translate-x-1'}`}
            />
          </button>
        </div>
        {isAutoSync && !isTeamRacing && (
          <div className="flex items-start gap-3 bg-amber-500/20 border border-amber-500/30 p-2 rounded-lg mt-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-200/80 leading-tight">
              Auto-sync is only active in Team Racing sessions. Use manual
              hosting for private sessions.
            </p>
          </div>
        )}
      </div>

      <div className="bg-slate-800/30 border border-slate-700/50 p-4 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Radio
              className={`h-5 w-5 ${showDebug ? 'text-green-400' : 'text-slate-500'}`}
            />
            <div>
              <h4 className="font-bold text-sm">P2P Debug Terminal</h4>
              <p className="text-xs text-slate-400">
                Show raw incoming data logs for troubleshooting.
              </p>
            </div>
          </div>
          <button
            onClick={toggleDebug}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${showDebug ? 'bg-green-600' : 'bg-slate-700'}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showDebug ? 'translate-x-6' : 'translate-x-1'}`}
            />
          </button>
        </div>
      </div>

      {mode === 'idle' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Host Card */}
          <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700 hover:border-blue-500/50 transition-colors">
            <Radio className="h-8 w-8 text-blue-400 mb-4" />
            <h3 className="text-lg font-bold mb-2">Host Session</h3>
            <p className="text-slate-400 text-sm mb-6">
              You are the driver. Share your live telemetry and fuel
              calculations with your team.
            </p>
            <button
              onClick={handleHost}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              Start Hosting
            </button>
          </div>

          {/* Guest Card */}
          <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700 hover:border-purple-500/50 transition-colors">
            <Link className="h-8 w-8 text-purple-400 mb-4" />
            <h3 className="text-lg font-bold mb-2">Join Session</h3>
            <p className="text-slate-400 text-sm mb-4">
              You are a teammate. Join a driver&apos;s session to see their data
              in your overlay.
            </p>
            <input
              type="text"
              placeholder="Enter Host ID"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 mb-4 text-sm focus:border-purple-500 outline-none"
            />
            <button
              onClick={() => joinSession(targetId)}
              disabled={!targetId}
              className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors"
            >
              Join Teammate
            </button>
          </div>
        </div>
      )}

      {mode === 'host' && (
        <div className="bg-blue-900/20 border border-blue-500/30 p-6 rounded-xl">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Radio className="h-6 w-6 text-blue-400" />
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              </div>
              <span className="font-bold text-blue-400 uppercase tracking-wider text-xs">
                Live Hosting Mode
              </span>
            </div>
            <button
              onClick={stop}
              className="text-slate-400 hover:text-red-400 flex items-center gap-1 text-sm bg-slate-800 py-1 px-3 rounded-md transition-colors"
            >
              <StopCircle className="h-4 w-4" /> Stop
            </button>
          </div>

          <div className="mb-6">
            <label className="block text-slate-400 text-xs uppercase font-bold mb-2 tracking-widest">
              Your Session ID
            </label>
            <div className="bg-slate-900 p-3 rounded-lg flex items-center justify-between border border-slate-700">
              <code className="text-blue-300 font-mono text-sm">
                {peerId || 'Generating...'}
              </code>
              <button
                onClick={copyId}
                className="p-1 hover:bg-slate-700 rounded transition-colors text-slate-400"
                title="Copy ID"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <p className="text-slate-500 text-xs mt-2 italic">
              Send this ID to your teammates so they can join.
            </p>
          </div>

          <button
            onClick={handleSyncHistory}
            className="w-full bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="h-4 w-4" /> Sync Fuel History with Guests
          </button>
        </div>
      )}

      {mode === 'guest' && (
        <div className="bg-purple-900/20 border border-purple-500/30 p-6 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Link className="h-6 w-6 text-purple-400" />
                <span
                  className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${lastDataReceived && now - lastDataReceived < 2000 ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}
                ></span>
              </div>
              <span className="font-bold text-purple-400 uppercase tracking-wider text-xs">
                Guest Mode Active
              </span>
            </div>
            <button
              onClick={stop}
              className="text-slate-400 hover:text-red-400 flex items-center gap-1 text-sm bg-slate-800 py-1 px-3 rounded-md transition-colors"
            >
              <StopCircle className="h-4 w-4" /> Disconnect
            </button>
          </div>

          <div className="flex items-center gap-4 mt-4 bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
            <div className="flex-1">
              <p className="text-[10px] text-slate-500 uppercase font-bold mb-1 tracking-widest">
                Connection Health
              </p>
              <div className="flex items-center gap-2">
                <div
                  className={`h-1.5 w-1.5 rounded-full ${lastDataReceived && now - lastDataReceived < 2000 ? 'bg-green-500' : 'bg-amber-500'}`}
                />
                <p className="text-xs text-slate-300">
                  {lastDataReceived
                    ? `Last data: ${((now - lastDataReceived) / 1000).toFixed(1)}s ago`
                    : 'Waiting for data...'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-500 uppercase font-bold mb-1 tracking-widest">
                Protocol
              </p>
              <p className="text-xs text-purple-300 font-mono">P2P Real-time</p>
            </div>
          </div>

          <p className="text-slate-400 text-[10px] mt-4 italic leading-relaxed">
            Receiving raw telemetry from teammate. The Fuel Calculator and all
            other widgets are now using the Host&apos;s live data stream.
          </p>
        </div>
      )}

      <div className="bg-slate-800/30 p-4 rounded-lg border border-slate-700/50">
        <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
          Instructions
        </h4>
        <ul className="text-xs text-slate-400 space-y-1 list-disc pl-4">
          <li>
            The <b>Host</b> should be the person currently driving in the
            simulator.
          </li>
          <li>
            <b>Guests</b> will see real-time fuel projections and consumption
            based on the Host&apos;s data.
          </li>
          <li>
            Fuel history is synced manually by the Host when someone joins, or
            automatically at each lap cross.
          </li>
          <li>
            This connection uses WebRTC and works over the internet (no VPN
            required).
          </li>
        </ul>
      </div>

      {/* P2P Debug Terminal */}
      {showDebug && <P2PDebugTerminal isVisible={showDebug} />}
    </div>
  );
};

const P2PDebugTerminal: React.FC<{ isVisible: boolean }> = ({ isVisible }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = React.useRef<HTMLDivElement>(null);

  const addLog = (msg: string) => {
    setLogs((prev) => {
      const newLogs = [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`];
      return newLogs.slice(-50); // Keep last 50 logs
    });
  };

  React.useEffect(() => {
    if (!isVisible) return;

    let lastTelemetryLog = 0;

    const unsubData = teamSharingService.onData((msg) => {
      // Throttle telemetry logs to avoid UI freeze (1 log per second)
      if (msg.type === 'telemetry') {
        const now = Date.now();
        if (now - lastTelemetryLog > 1000) {
          const t = msg.data as Record<string, unknown>;
          const fuel =
            t.FuelLevel &&
            typeof t.FuelLevel === 'object' &&
            'value' in t.FuelLevel
              ? t.FuelLevel.value
              : t.FuelLevel;
          const fuelDisplay =
            typeof fuel === 'number'
              ? (fuel as number).toFixed(1)
              : JSON.stringify(fuel);
          const lapDisplay =
            typeof t.Lap === 'object' ? JSON.stringify(t.Lap) : t.Lap;
          const timeRemainDisplay =
            typeof t.SessionTimeRemain === 'object'
              ? JSON.stringify(t.SessionTimeRemain)
              : (t.SessionTimeRemain as number)?.toFixed(1);
          const lapsRemainDisplay =
            typeof t.SessionLapsRemain === 'object'
              ? JSON.stringify(t.SessionLapsRemain)
              : t.SessionLapsRemain;
          const totalLapsDisplay =
            typeof t.SessionLaps === 'object'
              ? JSON.stringify(t.SessionLaps)
              : t.SessionLaps;

          addLog(
            `RX: Telem L:${lapDisplay} F:${fuelDisplay} LR:${lapsRemainDisplay} TR:${timeRemainDisplay} TL:${totalLapsDisplay}`
          );
          lastTelemetryLog = now;
        }
        return;
      }

      addLog(`RX: ${msg.type}`);
    });

    // We can't easily hook into "onPeerConnected" here without exposing it publicly in a way that allows multiple listeners safely,
    // but we can listen to status changes.
    const unsubStatus = teamSharingService.onStatusChange((mode, id) => {
      addLog(`Status: ${mode} ${id ? `(${id})` : ''}`);
    });

    return () => {
      unsubData();
      unsubStatus();
    };
  }, [isVisible]);

  React.useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="mt-8 border-t border-slate-700/50 pt-6">
      <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">
        P2P Debug Terminal
      </h4>
      <div className="bg-black/80 font-mono text-[10px] text-green-400 p-3 rounded-lg h-32 overflow-y-auto border border-slate-700">
        {logs.length === 0 && (
          <span className="text-slate-600 italic">
            Waiting for P2P events...
          </span>
        )}
        {logs.map((log, i) => (
          <div key={i}>{log}</div>
        ))}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
};
