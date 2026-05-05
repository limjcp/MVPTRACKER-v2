import { useEffect, useState } from 'react';
import Sidebar from '../admin/components/Sidebar';
import Settings from '../admin/components/Settings';
import Overview from '../admin/components/Overview';
import Users from '../admin/components/Users';
import Security from '../admin/components/Security';
import { useAdminSettingsStore } from '../admin/store/useAdminSettingsStore';
import type { AdminView } from '../admin/types/adminView';
import CurrentUserMenu from '../components/CurrentUserMenu';

export default function AdminRoot() {
  const [currentView, setCurrentView] = useState<AdminView>('overview');
  const hydrate = useAdminSettingsStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0D0F14] font-sans">
      <div className="absolute top-0 left-0 right-0 h-8 bg-[#111318] border-b border-white/[0.05] flex items-center px-4 z-50 select-none">
        <div className="flex items-center gap-1.5">
          {/* <div className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 cursor-pointer transition-colors" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80 hover:bg-yellow-500 cursor-pointer transition-colors" />
          <div className="w-3 h-3 rounded-full bg-green-500/80 hover:bg-green-500 cursor-pointer transition-colors" /> */}
        </div>
        <div className="absolute inset-x-0 flex items-center justify-center pointer-events-none">
          <span className="text-white/20 text-[11px] font-medium">MVPTime — Admin</span>
        </div>
        <div className="ml-auto flex items-center gap-2 select-auto">
          <CurrentUserMenu variant="titlebar" />
        </div>
      </div>

      <div className="flex flex-1 mt-8 overflow-hidden">
        <Sidebar currentView={currentView} setView={setCurrentView} />
        <main className="flex-1 flex flex-col overflow-hidden">
          {currentView === 'overview' ? (
            <Overview />
          ) : currentView === 'users' ? (
            <Users />
          ) : currentView === 'security' ? (
            <Security />
          ) : currentView === 'settings' ? (
            <Settings />
          ) : (
            <Overview />
          )}
        </main>
      </div>
    </div>
  );
}
