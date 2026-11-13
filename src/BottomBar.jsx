import React from 'react';
import { Home, Library, ScanBarcode, Users, Menu } from 'lucide-react';

// On phones: quick buttons along the bottom, so the side menu isn't needed for everyday things.
export default function BottomBar({ active, onGo, onScan, onMenu, libraryCount = 0, peopleCount = 0 }) {
  const item = (key, label, Icon, onClick, badge) => (
    <button key={key} onClick={onClick} aria-current={active === key ? 'page' : undefined}
      className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold relative ${active === key ? 'text-amber-400' : 'text-[#bfd0c4]'}`}>
      <Icon className="w-5 h-5" />
      {label}
      {badge > 0 && <span className="absolute top-0.5 left-1/2 ml-2 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-[#1e2f26] text-[9px] font-bold flex items-center justify-center">{badge}</span>}
    </button>
  );
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-[#24392f] border-t border-[#1e2f26] flex items-stretch px-1 pb-[env(safe-area-inset-bottom)]" aria-label="Quick menu">
      {item('home', 'Home', Home, () => onGo('home'))}
      {item('library', 'Library', Library, () => onGo('library'), libraryCount)}
      <div className="flex-1 flex items-center justify-center">
        <button onClick={onScan} aria-label="Scan a book" className="-mt-5 w-14 h-14 rounded-full bg-amber-500 text-[#1e2f26] shadow-lg shadow-black/30 flex items-center justify-center border-4 border-[#f4efe3]">
          <ScanBarcode className="w-6 h-6" />
        </button>
      </div>
      {item('people', 'People', Users, () => onGo('people'), peopleCount)}
      {item('menu', 'More', Menu, onMenu)}
    </nav>
  );
}
