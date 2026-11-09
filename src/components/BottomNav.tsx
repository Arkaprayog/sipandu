import React from 'react';
import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  FileSpreadsheet,
  FolderArchive,
  HandHeart,
  MapPinned,
  Footprints,
  ChartNoAxesCombined,
  ShieldCheck,
} from 'lucide-react';

export type TabKey =
  | 'beranda'
  | 'database-ppks'
  | 'asesmen'
  | 'from-asesmen-terintegrasi'
  | 'dokumen'
  | 'layanan-ppks'
  | 'intelijen-wilayah'
  | 'pendampingan-lapangan'
  | 'laporan-kinerja'
  | 'security-audit';

interface BottomNavProps {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  currentUserRole: string;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onSelectTab, currentUserRole }) => {
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
    {
      key: 'layanan-ppks',
      label: 'LAYANAN PPKS',
      icon: <HandHeart className="w-4 h-4 md:w-5 md:h-5" />,
    },
    {
      key: 'intelijen-wilayah',
      label: 'PETA WILAYAH',
      icon: <MapPinned className="w-4 h-4 md:w-5 md:h-5" />,
    },
    {
      key: 'pendampingan-lapangan',
      label: 'PENDAMPINGAN',
      icon: <Footprints className="w-4 h-4 md:w-5 md:h-5" />,
    },
    {
      key: 'laporan-kinerja',
      label: 'LAPORAN',
      icon: <ChartNoAxesCombined className="w-4 h-4 md:w-5 md:h-5" />,
    },
    {
      key: 'security-audit',
      label: 'KEAMANAN & AUDIT',
      icon: <ShieldCheck className="w-4 h-4 md:w-5 md:h-5" />,
    },
  ];

  return (
    <nav className="app-nav-bar fixed bottom-0 left-0 right-0 z-30 bg-[#0d180f]/95 border-t border-rose-500/40 shadow-[0_-4px_25px_rgba(244,63,94,0.18)] select-none">
      <div className="max-w-7xl mx-auto px-2 md:px-6">
        <div className="flex items-center justify-between gap-0.5 sm:gap-1 md:justify-center md:gap-3 py-2 overflow-visible no-scrollbar">
          {tabs.filter((tab) => tab.key !== 'security-audit' || ['owner', 'supervisor'].includes(currentUserRole)).map((tab, index, visibleTabs) => {
            const isActive = activeTab === tab.key;
            const labelAlignment = index < 3
              ? 'left-0'
              : index >= visibleTabs.length - 3
                ? 'right-0'
                : 'left-1/2 -translate-x-1/2';
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onSelectTab(tab.key)}
                aria-label={tab.label}
                aria-current={isActive ? 'page' : undefined}
                className={`relative z-10 flex-1 md:flex-initial min-w-0 md:min-w-[52px] h-11 md:h-12 px-0.5 md:px-2 rounded-xl flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                  isActive
                    ? 'z-20 bg-gradient-to-r from-emerald-900/90 to-[#193d1d] text-white border border-rose-500/60 shadow-[0_0_15px_rgba(244,63,94,0.3)] scale-[1.02]'
                    : 'text-neutral-300 hover:text-white hover:bg-emerald-950/40 border border-transparent'
                }`}
              >
                <span className={isActive ? 'shrink-0 text-sky-300' : 'shrink-0 text-neutral-400'} aria-hidden="true">
                  {tab.icon}
                </span>
                <span
                  className={isActive
                    ? `sipandu-nav-label--active absolute bottom-full ${labelAlignment} z-[60] mb-2 w-max max-w-[calc(100vw-24px)] rounded-xl px-2.5 py-1.5 text-center whitespace-nowrap pointer-events-none`
                    : 'sipandu-nav-label--hidden'}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
