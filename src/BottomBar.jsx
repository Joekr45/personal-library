import React from 'react';
import { Home, Library, ScanBarcode, Activity, Menu } from 'lucide-react';

// On phones: quick buttons along the bottom, so the side menu isn't needed for everyday things.
export default function BottomBar({ active, onGo, onScan, onMenu, inboxCount, menuCount = 0 }) {
  const item = (key, label, Icon, onClick, badge) => (
    <button key={key} onClick={onClick} aria-current={active === key ? 'page' : undefined}
      className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold relative ${active === key ? 'text-orange-600' : 'text-slate-500'}`}>
      <Icon className="w-5 h-5" />
      {label}
      {badge > 0 && <span className="absolute top-0.5 left-1/2 ml-2 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">{badge}</span>}
    </button>
  );
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-[#fbfbfd]/95 backdrop-blur-md border-t border-slate-200 flex items-stretch px-1 pb-[env(safe-area-inset-bottom)]" aria-label="Quick menu">
      {item('home', 'Home', Home, () => onGo('home'))}
      {item('all', 'Library', Library, () => onGo('all'))}
      <div className="flex-1 flex items-center justify-center">
        <button onClick={onScan} aria-label="Scan a book" className="-mt-5 w-14 h-14 rounded-full bg-orange-500 text-white shadow-lg shadow-orange-500/30 flex items-center justify-center border-4 border-[#fbfbfd]">
          <ScanBarcode className="w-6 h-6" />
        </button>
      </div>
      {item('activity', 'Activity', Activity, () => onGo('activity'), inboxCount)}
      {item('menu', 'More', Menu, onMenu, menuCount)}
    </nav>
  );
}
