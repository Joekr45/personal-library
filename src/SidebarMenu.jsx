import React, { useState } from 'react';
import {
  Home, Library, BookOpen, BookMarked, BookmarkCheck, CircleSlash, Heart, HandHelping, Tags, Trophy, Timer, Quote, Flag,
  Activity, MessagesSquare, ListOrdered, Users, Gift, Sparkles, Compass, Layers, ChevronDown, ChevronRight, MapPin, HandHeart
} from 'lucide-react';

// Everything in the menu, in order, grouped into sections that open and close.
// familyOnly: hidden for Friend accounts. fixed: can't be hidden in Settings → Menu.
export const MENU = [
  { group: 'books', title: 'My Books', items: [
    { key: 'home', label: 'Home', icon: Home, fixed: true },
    { key: 'all', label: 'All Books', icon: Library, count: 'all', fixed: true },
    { key: 'reading', label: 'Reading Now', icon: BookOpen, count: 'reading' },
    { key: 'unread', label: 'Want to Read', icon: BookMarked, count: 'unread' },
    { key: 'completed', label: 'Finished', icon: BookmarkCheck, count: 'completed' },
    { key: 'dnf', label: 'Did Not Finish', icon: CircleSlash, count: 'dnf', onlyWithCount: true },
    { key: 'wishlist', label: 'Missing / Wishlist', icon: Heart, count: 'wishlist' },
    { key: 'lent', label: 'Lent Out', icon: HandHelping, count: 'lent', alert: 'overdue' },
    { key: 'places', label: 'Where Is It?', icon: MapPin }
  ] },
  { group: 'shelves', title: 'My Shelves', shelves: true, items: [] },
  { group: 'reading', title: 'My Reading', items: [
    { key: 'year', label: 'My Year', icon: Trophy },
    { key: 'readinglog', label: 'Reading Log', icon: Timer },
    { key: 'quotes', label: 'My Quotes', icon: Quote, count: 'quotes' },
    { key: 'challenges', label: 'Family Challenges', icon: Flag, familyOnly: true }
  ] },
  { group: 'people', title: 'People', items: [
    { key: 'activity', label: 'Activity', icon: Activity, alert: 'inbox' },
    { key: 'borrow', label: 'Borrow', icon: HandHeart, alert: 'borrow' },
    { key: 'clubs', label: 'Book Clubs', icon: MessagesSquare },
    { key: 'lists', label: 'Lists', icon: ListOrdered },
    { key: 'family', label: 'Family Shelves', icon: Users, familyOnly: true },
    { key: 'gifts', label: 'Gift Ideas', icon: Gift, familyOnly: true }
  ] },
  { group: 'discover', title: 'Discover', items: [
    { key: 'new', label: 'New for You', icon: Sparkles, alert: 'newReleases' },
    { key: 'discover', label: 'Recommendations', icon: Compass },
    { key: 'authors', label: 'Authors & Lookup', icon: Users, count: 'authors' },
    { key: 'series', label: 'Series Collections', icon: Layers, count: 'series' }
  ] }
];

// Items a person may hide (Settings → Menu).
export const HIDEABLE = MENU.flatMap(g => g.items.filter(i => !i.fixed).map(i => ({ ...i, groupTitle: g.title })));

const OPEN_KEY = 'pl_menu_open';
const readOpen = () => { try { return JSON.parse(localStorage.getItem(OPEN_KEY) || '{}'); } catch { return {}; } };

export default function SidebarMenu({ active, onSelect, counts, alerts, shelves, activeShelf, isFamily, hidden = [] }) {
  const [open, setOpen] = useState(readOpen); // { group: false } when closed; open by default
  const toggle = (group) => setOpen(prev => {
    const next = { ...prev, [group]: prev[group] === false };
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* not important */ }
    return next;
  });
  const hiddenSet = new Set(hidden);
  const visible = (item) => !(item.familyOnly && !isFamily) && !hiddenSet.has(item.key) && !(item.onlyWithCount && !counts[item.count]);

  const row = (key, label, Icon, right, isActive, activeClass = 'bg-orange-500 text-white shadow-xs') => (
    <button
      key={key}
      data-nav
      onClick={() => onSelect(key)}
      aria-current={isActive ? 'page' : undefined}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${isActive ? activeClass : 'text-slate-600 hover:bg-slate-200/60'}`}
    >
      <div className="flex items-center gap-2.5 min-w-0"><Icon className="w-4 h-4 flex-shrink-0" /><span className="truncate">{label}</span></div>
      {right}
    </button>
  );
  const number = (n, isActive) => <span className={`text-[11px] font-normal ${isActive ? 'text-orange-100' : 'text-slate-400'}`}>{n}</span>;
  const redBadge = (n, title) => <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-500 text-white" title={title}>{n}</span>;

  return (
    <nav className="space-y-3" aria-label="Library menu">
      {MENU.map(section => {
        const items = section.items.filter(visible);
        if (!section.shelves && items.length === 0) return null;
        if (section.shelves && hiddenSet.has('shelves')) return null;
        const containsActive = section.shelves ? Boolean(activeShelf) : items.some(i => i.key === active);
        const isOpen = open[section.group] !== false || containsActive;
        const alertCount = section.shelves ? 0 : items.reduce((n, i) => n + (i.alert ? alerts[i.alert] || 0 : 0), 0);
        return (
          <div key={section.group} className="space-y-0.5">
            <button data-keep-open onClick={() => toggle(section.group)} aria-expanded={isOpen}
              className="w-full flex items-center justify-between px-2 py-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase hover:text-slate-600">
              <span className="flex items-center gap-1">{isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}{section.title}</span>
              {!isOpen && alertCount > 0 && <span className="w-2 h-2 rounded-full bg-rose-500" aria-label={`${alertCount} new`} />}
            </button>
            {isOpen && section.shelves && (
              shelves.length === 0
                ? <p className="text-[11px] text-slate-400 px-3 leading-snug">Make your own shelves (e.g. “Beach reads”) from any book's page.</p>
                : shelves.map(s => row(`shelf:${s.name}`, s.name, Tags,
                  <span className={`text-[11px] font-normal ${activeShelf === s.name ? 'text-violet-100' : 'text-slate-400'}`}>{s.count}</span>,
                  activeShelf === s.name, 'bg-violet-500 text-white shadow-xs'))
            )}
            {isOpen && !section.shelves && items.map(item => {
              const isActive = active === item.key;
              let right = null;
              if (item.alert === 'overdue' && alerts.overdue > 0) right = redBadge(counts[item.count], `${alerts.overdue} overdue`);
              else if (item.alert && item.alert !== 'overdue' && alerts[item.alert] > 0) right = redBadge(alerts[item.alert]);
              else if (item.count) right = number(counts[item.count] ?? 0, isActive);
              return row(item.key, item.label, item.icon, right, isActive);
            })}
          </div>
        );
      })}
    </nav>
  );
}
