import React, { useEffect, useRef } from 'react';
import {
  Home, Library, BookOpen, BookMarked, BookmarkCheck, CircleSlash, Heart, HandHelping, Tags, Trophy, Timer, Quote, Flag,
  Activity, MessagesSquare, ListOrdered, Users, Gift, Sparkles, Compass, Layers, MapPin, HandHeart, User
} from 'lucide-react';

// The menu: five areas. Each area's pages show as tabs along the top of the page.
// familyOnly: hidden for Friend accounts. fixed: can't be hidden in Settings → Menu.
// onlyWithCount: only shown when it has books in it.
export const AREAS = [
  { key: 'home', label: 'Home', icon: Home, tabs: [{ key: 'home', label: 'Home', icon: Home, fixed: true }] },
  { key: 'library', label: 'Library', icon: Library, count: 'all', tabs: [
    { key: 'all', label: 'All', icon: Library, count: 'all', fixed: true },
    { key: 'reading', label: 'Reading', icon: BookOpen, count: 'reading' },
    { key: 'unread', label: 'Want to Read', icon: BookMarked, count: 'unread' },
    { key: 'completed', label: 'Finished', icon: BookmarkCheck, count: 'completed' },
    { key: 'dnf', label: 'Did not finish', icon: CircleSlash, count: 'dnf', onlyWithCount: true },
    { key: 'wishlist', label: 'Wishlist', icon: Heart, count: 'wishlist' },
    { key: 'lent', label: 'Lent out', icon: HandHelping, count: 'lent', alert: 'overdue' },
    { key: 'shelves', label: 'My Shelves', icon: Tags, divider: true },
    { key: 'series', label: 'Series', icon: Layers },
    { key: 'authors', label: 'Authors', icon: User },
    { key: 'places', label: 'Where is it?', icon: MapPin }
  ] },
  { key: 'myreading', label: 'My Reading', icon: Trophy, tabs: [
    { key: 'year', label: 'My Year', icon: Trophy, fixed: true },
    { key: 'readinglog', label: 'Reading Log', icon: Timer },
    { key: 'quotes', label: 'Quotes', icon: Quote, count: 'quotes' },
    { key: 'challenges', label: 'Challenges', icon: Flag, familyOnly: true }
  ] },
  { key: 'people', label: 'People', icon: Users, tabs: [
    { key: 'activity', label: 'Activity', icon: Activity, alert: 'inbox', fixed: true },
    { key: 'borrow', label: 'Borrow', icon: HandHeart, alert: 'borrow' },
    { key: 'clubs', label: 'Book Clubs', icon: MessagesSquare },
    { key: 'lists', label: 'Lists', icon: ListOrdered },
    { key: 'family', label: 'Family Shelves', icon: Users, familyOnly: true },
    { key: 'gifts', label: 'Gift Ideas', icon: Gift, familyOnly: true }
  ] },
  { key: 'discover', label: 'Discover', icon: Compass, tabs: [
    { key: 'discover', label: 'Recommendations', icon: Compass, fixed: true },
    { key: 'new', label: 'New for You', icon: Sparkles, alert: 'newReleases' }
  ] }
];

// Which area a page belongs to ("shelf:Beach reads" is in the Library).
export const areaOf = (section) => {
  if (String(section || '').startsWith('shelf:')) return 'library';
  return AREAS.find(a => a.tabs.some(t => t.key === section))?.key || 'library';
};
// The tab to highlight for a page.
export const tabOf = (section) => (String(section || '').startsWith('shelf:') ? 'shelves' : section);

// Pages a person may hide (Settings → Menu).
export const HIDEABLE = AREAS.flatMap(a => a.tabs.filter(t => !t.fixed).map(t => ({ ...t, groupTitle: a.label })));

// Remember the last tab used in each area, so tapping "Library" goes back to where you were.
const LAST_KEY = 'pl_area_last';
const readLast = () => { try { return JSON.parse(localStorage.getItem(LAST_KEY) || '{}'); } catch { return {}; } };
export const rememberSection = (section) => {
  const area = areaOf(section);
  if (area === 'home') return;
  try { localStorage.setItem(LAST_KEY, JSON.stringify({ ...readLast(), [area]: section })); } catch { /* not important */ }
};

const visibleTabs = (area, { isFamily, hidden = [], counts = {} }) => {
  const hiddenSet = new Set(hidden);
  return area.tabs.filter(t => !(t.familyOnly && !isFamily) && !hiddenSet.has(t.key) && !(t.onlyWithCount && !counts[t.count]));
};
// Where tapping an area goes.
export const sectionForArea = (areaKey, opts) => {
  const area = AREAS.find(a => a.key === areaKey);
  const tabs = visibleTabs(area, opts);
  const last = readLast()[areaKey];
  if (last && (last.startsWith('shelf:') ? tabs.some(t => t.key === 'shelves') : tabs.some(t => t.key === last))) return last;
  return tabs[0]?.key || area.tabs[0].key;
};
const alertsIn = (tabs, alerts) => tabs.reduce((n, t) => n + (t.alert ? alerts[t.alert] || 0 : 0), 0);
export const areaAlerts = (areaKey, opts, alerts) => alertsIn(visibleTabs(AREAS.find(a => a.key === areaKey), opts), alerts);

const redBadge = (n, title) => <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-500 text-white" title={title}>{n}</span>;

// The side menu: the five areas.
export default function SidebarMenu({ active, onSelect, counts, alerts, isFamily, hidden = [] }) {
  const opts = { isFamily, hidden, counts };
  const current = areaOf(active);
  return (
    <nav className="space-y-0.5" aria-label="Library menu">
      {AREAS.map(area => {
        const isActive = current === area.key;
        const n = areaAlerts(area.key, opts, alerts);
        const right = n > 0 ? redBadge(n) : area.count ? <span className={`text-[11px] font-normal ${isActive ? 'text-orange-100' : 'text-slate-400'}`}>{counts[area.count] ?? 0}</span> : null;
        return (
          <button
            key={area.key}
            data-nav
            onClick={() => onSelect(sectionForArea(area.key, opts))}
            aria-current={isActive ? 'page' : undefined}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${isActive ? 'bg-orange-500 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200/60'}`}
          >
            <span className="flex items-center gap-2.5 min-w-0"><area.icon className="w-4 h-4 flex-shrink-0" /><span className="truncate">{area.label}</span></span>
            {right}
          </button>
        );
      })}
    </nav>
  );
}

// The tabs along the top of a page, for the area it's in.
export function AreaTabs({ active, onSelect, counts, alerts, isFamily, hidden = [] }) {
  const strip = useRef(null);
  // On a phone the strip scrolls sideways: keep the current tab in view.
  useEffect(() => {
    const el = strip.current?.querySelector('[aria-selected="true"]');
    if (el && strip.current.scrollWidth > strip.current.clientWidth) {
      strip.current.scrollLeft = el.offsetLeft - (strip.current.clientWidth - el.offsetWidth) / 2;
    }
  }, [active]);
  const area = AREAS.find(a => a.key === areaOf(active));
  if (!area || area.key === 'home') return null;
  const tabs = visibleTabs(area, { isFamily, hidden, counts });
  if (tabs.length < 2) return null;
  const current = tabOf(active);
  return (
    <div ref={strip} className="relative -mx-3 md:mx-0 mb-4 md:mb-6 px-3 md:px-0 overflow-x-auto no-scrollbar" role="tablist" aria-label={area.label}>
      <div className="flex gap-1.5 w-max md:w-auto md:flex-wrap">
        {tabs.map(t => {
          const on = current === t.key;
          const alert = t.alert ? alerts[t.alert] || 0 : 0;
          const count = t.count ? counts[t.count] : null;
          return (
            <React.Fragment key={t.key}>
            {t.divider && <span className="w-px self-stretch my-1.5 mx-1 bg-slate-200" aria-hidden="true" />}
            <button role="tab" aria-selected={on} data-nav onClick={() => onSelect(t.key)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 border transition-colors ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
              {alert > 0 ? <span className="px-1.5 rounded-full bg-rose-500 text-white text-[10px]">{alert}</span>
                : count !== null && count !== undefined ? <span className={`text-[10px] font-normal ${on ? 'text-slate-300' : 'text-slate-400'}`}>{count}</span> : null}
            </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
