import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Timer, FileText } from 'lucide-react';
import { cn } from '../utils/cn';
import type { AdminView } from '../types/adminView';

const NAV_ITEMS: { id: AdminView; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'reports', label: 'Reports', icon: FileText },
];

export default function Sidebar({
  currentView,
  setView,
}: {
  currentView: AdminView;
  setView: (v: AdminView) => void;
}) {
  const navigate = useNavigate();
  return (
    <aside className="flex flex-col w-64 bg-[#111318] border-r border-white/[0.06] h-screen overflow-hidden flex-shrink-0">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/[0.06]">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-lg shadow-violet-900/40 flex-shrink-0">
          <Timer className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-white font-semibold text-[15px] leading-none">MVPTime</h1>
          <p className="text-white/40 text-[11px] mt-0.5">Admin Portal</p>
        </div>
      </div>

      <nav className="flex-1 min-h-0 px-3 py-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = currentView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150',
                active
                  ? 'bg-violet-500/20 text-violet-300'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/[0.05]'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="px-3 border-t border-white/[0.06] pt-3 pb-10 mt-auto">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="w-full px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white/50 hover:text-white/70 text-[11px] font-medium transition-colors"
        >
          Switch portal
        </button>
      </div>
    </aside>
  );
}
