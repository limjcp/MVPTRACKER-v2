import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAutomaticTracking } from './useAutomaticTracking';
import { useTaskCheckInScheduler } from './useTaskCheckInScheduler';
import { useSupabaseSync } from './useSupabaseSync';
import { useStore } from './store/useStore';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Timeline from './components/Timeline';
import Review from './components/Review';
import Projects from './components/Projects';
import Reports from './components/Reports';
import TaskCheckInPanel from './components/TaskCheckInPanel';

export default function App() {
  const [searchParams] = useSearchParams();
  const isCheckIn = searchParams.has('checkin');
  const { currentView, tickTimers, hydrate } = useStore();

  useTaskCheckInScheduler(!isCheckIn);
  useAutomaticTracking(!isCheckIn);
  useSupabaseSync(!isCheckIn);

  // Tick all active timers every second
  useEffect(() => {
    const interval = setInterval(tickTimers, 1000);
    return () => clearInterval(interval);
  }, [tickTimers]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (isCheckIn) {
    return <TaskCheckInPanel />;
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <Dashboard />;
      case 'timeline': return <Timeline />;
      case 'review': return <Review />;
      case 'projects': return <Projects />;
      case 'reports': return <Reports />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#0D0F14] font-sans">
      {/* macOS-style title bar area */}
      <div className="absolute top-0 left-0 right-0 h-8 bg-[#111318] border-b border-white/[0.05] flex items-center px-4 z-50 select-none">
        <div className="flex items-center gap-1.5">
          {/* <div className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 cursor-pointer transition-colors" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80 hover:bg-yellow-500 cursor-pointer transition-colors" />
          <div className="w-3 h-3 rounded-full bg-green-500/80 hover:bg-green-500 cursor-pointer transition-colors" /> */}
        </div>
        <div className="absolute inset-x-0 flex items-center justify-center pointer-events-none">
          <span className="text-white/20 text-[11px] font-medium">MVPTracker — Staff</span>
        </div>
      </div>

      {/* Main layout below titlebar */}
      <div className="flex flex-1 mt-8 overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden">
          {renderView()}
        </main>
      </div>
    </div>
  );
}

