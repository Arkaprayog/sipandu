import React from 'react';
import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  FileSpreadsheet,
  FolderArchive,
} from 'lucide-react';

export type TabKey =
  | 'beranda'
  | 'database-ppks'
  | 'asesmen'
  | 'from-asesmen-terintegrasi'
  | 'dokumen';

interface BottomNavProps {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onSelectTab }) => {
  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    {
      key: 'beranda',
      label: 'BERANDA',
      icon: <LayoutDashboard className="w-4 h-4 md:w-5 md:h-5" />,
    },
    {
      key: 'database-ppks',
      label: 'DATABASE PPKS',
      icon: <Users className="w-4 h-4 md:w-5 md:h-5" />,
    },
    {
      key: 'asesmen',
      label: 'ASESMEN',
      icon: <ClipboardCheck className="w-4 h-4 md:w-5 md:h-5" />,
    },
    {
      key: 'from-asesmen-terintegrasi',
      label: 'FROM ASESMEN TERINTEGRASI',
      icon: <FileSpreadsheet className="w-4 h-4 md:w-5 md:h-5" />,
    },
    {
      key: 'dokumen',
      label: 'DOKUMEN',
      icon: <FolderArchive className="w-4 h-4 md:w-5 md:h-5" />,
    },
  ];

  return (
    <nav className="app-nav-bar fixed bottom-0 left-0 right-0 z-30 bg-[#0d180f]/95 border-t border-rose-500/40 shadow-[0_-4px_25px_rgba(244,63,94,0.18)] select-none">
      <div className="max-w-7xl mx-auto px-2 md:px-6">
        <div className="flex items-center justify-between md:justify-center md:gap-4 py-2 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onSelectTab(tab.key)}
                className={`flex-1 md:flex-initial min-w-[70px] md:min-w-[150px] py-2 px-2 md:px-4 rounded-xl flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 text-[10px] md:text-xs font-bold tracking-wider transition-all cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-emerald-900/90 to-[#193d1d] text-white border border-rose-500/60 shadow-[0_0_15px_rgba(244,63,94,0.3)] scale-[1.02]'
                    : 'text-neutral-300 hover:text-white hover:bg-emerald-950/40 border border-transparent'
                }`}
              >
                <span className={isActive ? 'text-sky-300' : 'text-neutral-400'}>
                  {tab.icon}
                </span>
                <span className="text-center truncate leading-tight">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
