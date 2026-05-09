import { useSearchParams } from 'react-router-dom';
import { useStore } from './store/useStore';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Timeline from './components/Timeline';
import Review from './components/Review';
import Projects from './components/Projects';
import Reports from './components/Reports';
import TaskCheckInPanel from './components/TaskCheckInPanel';
import CurrentUserMenu from '../components/CurrentUserMenu';
import TitleBarBrandLabel from '../components/TitleBarBrandLabel';

export default function App() {
  const [searchParams] = useSearchParams();
  const isCheckIn = searchParams.has('checkin');
  const { currentView } = useStore();

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
          <TitleBarBrandLabel mode="Staff" />
        </div>
        <div className="ml-auto flex items-center gap-2 select-auto">
          <CurrentUserMenu variant="titlebar" />
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

