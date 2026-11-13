import React, { useEffect, useState } from 'react';
import {
  X, Settings, CheckCircle2, RefreshCw, ExternalLink, AlertTriangle, Download, KeyRound, Users, Database,
  Smartphone, Trash2, Lock, Upload, Moon, Library, Activity, Info, Menu, Search
} from 'lucide-react';
import { HIDEABLE } from './SidebarMenu.jsx';
import { api } from './api.js';
import { getTheme, setTheme } from './theme.js';

function Section({ icon: Icon, title, children }) {
  return (
    <section className="space-y-2.5 pb-5 border-b border-slate-100 last:border-0">
      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Icon className="w-4 h-4 text-orange-500" /> {title}</h4>
      {children}
    </section>
  );
}

const inputClass = 'w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orange-500';
const buttonClass = 'px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 hover:bg-slate-50 flex items-center justify-center gap-1.5 disabled:opacity-50';

// ---------- Activity feed ----------
function ActivitySection() {
  const [on, setOn] = useState(null);
  useEffect(() => { api.mySocial().then(s => setOn(s.activityOn)).catch(() => setOn(true)); }, []);
  if (on === null) return null;
  return (
    <Section icon={Activity} title="Activity feed">
      <label className="flex items-start gap-2 p-3 bg-slate-50 rounded-xl cursor-pointer">
        <input type="checkbox" checked={on} className="w-4 h-4 mt-0.5 accent-orange-500"
          onChange={async (e) => { const next = e.target.checked; setOn(next); try { setOn(await api.setActivity(next)); } catch { setOn(!next); } }} />
        <span><b>Show my reading activity to family &amp; friends.</b> When you start, finish, rate or post an update about a book, it appears in their Activity feed, and your ratings help their Discover page. Your notes and private reviews are never shared.</span>
      </label>
    </Section>
  );
}

// ---------- Fill in descriptions & genres for every book ----------
function FillInfoButton({ books, onBookSaved }) {
  const todo = (books || []).filter(b => !b.infoCheckedOn);
  const [progress, setProgress] = useState(null);
  const run = async () => {
    let done = 0;
    setProgress({ done, total: todo.length });
    for (const b of todo) {
      try { const res = await api.fillBookInfo(b.id); onBookSaved?.(res.book); } catch { /* skip it */ }
      done++;
      setProgress({ done, total: todo.length });
    }
  };
  if (progress) {
    return <p className="text-slate-500 flex items-center gap-1.5">{progress.done < progress.total ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />} Book info: {progress.done} of {progress.total} done{progress.done < progress.total ? ' (keep this window open)' : '.'}</p>;
  }
  if (todo.length === 0) return null;
  return <button onClick={run} className={buttonClass}><Info className="w-3.5 h-3.5" /> Fill in descriptions &amp; genres for {todo.length} book{todo.length === 1 ? '' : 's'}</button>;
}

// ---------- Menu: choose which items you see ----------
function MenuSection({ prefs, onPrefsChange, isFamily }) {
  const [hiddenList, setHiddenList] = useState(prefs?.hiddenMenu || []);
  useEffect(() => { setHiddenList(prefs?.hiddenMenu || []); }, [prefs?.hiddenMenu]);
  const hidden = new Set(hiddenList);
  const [error, setError] = useState('');
  const toggle = async (key) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key); else next.add(key);
    setHiddenList([...next]); // show the change right away
    setError('');
    try { onPrefsChange?.(await api.setPrefs({ hiddenMenu: [...next] })); } catch (err) { setError(err.message); setHiddenList(prefs?.hiddenMenu || []); }
  };
  const items = [...HIDEABLE.filter(i => !i.familyOnly || isFamily), { key: 'shelves', label: 'My Shelves (whole section)', groupTitle: 'My Shelves' }];
  return (
    <Section icon={Menu} title="Menu">
      <p className="text-slate-500">Untick anything you don't use to hide it from your menu. This is just for you, on every device. You can bring things back any time.</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {items.map(i => (
          <label key={i.key} className="flex items-center gap-2 py-0.5 text-slate-700">
            <input type="checkbox" checked={!hidden.has(i.key)} onChange={() => toggle(i.key)} className="accent-orange-500" />
            {i.label}
          </label>
        ))}
      </div>
      {error && <p className="text-red-700">{error}</p>}
    </Section>
  );
}

// ---------- Look again for books saved as "Unknown Author" ----------
function FixAuthorsButton({ books, onBookSaved }) {
  const unknown = (books || []).filter(b => !String(b.author || '').trim() || /^unknown( author)?$/i.test(String(b.author).trim()));
  const [state, setState] = useState(null); // 'working' | { fixed, stillUnknown }
  const run = async () => {
    setState('working');
    try {
      const res = await api.fixAuthors();
      res.fixed.forEach(f => onBookSaved?.(f.book));
      setState(res);
    } catch (err) {
      setState({ error: err.message });
    }
  };
  if (state === 'working') return <p className="text-slate-500 flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Looking up {unknown.length} author{unknown.length === 1 ? '' : 's'}…</p>;
  if (state?.error) return <p className="text-red-700">{state.error}</p>;
  if (state) {
    return (
      <p className="text-slate-600">
        Found {state.fixed.length} author{state.fixed.length === 1 ? '' : 's'}{state.fixed.length ? `: ${state.fixed.map(f => `${f.title} → ${f.author}`).join('; ')}` : ''}.
        {state.stillUnknown > 0 && ` ${state.stillUnknown} still unknown; open those books and type the author with Edit.`}
      </p>
    );
  }
  if (unknown.length === 0) return null;
  return <button onClick={run} className={buttonClass}><Search className="w-3.5 h-3.5" /> Find missing authors ({unknown.length} book{unknown.length === 1 ? '' : 's'})</button>;
}

// ---------- Appearance ----------
function AppearanceSection() {
  const [choice, setChoice] = useState(getTheme());
  const pick = (value) => { setChoice(value); setTheme(value); };
  return (
    <Section icon={Moon} title="Appearance">
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Appearance">
        {[['light', 'Light'], ['dark', 'Dark'], ['auto', 'Match device']].map(([value, label]) => (
          <button key={value} role="radio" aria-checked={choice === value} onClick={() => pick(value)}
            className={`py-2 rounded-xl text-xs font-semibold border ${choice === value ? 'bg-orange-500 text-white border-orange-500' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {label}
          </button>
        ))}
      </div>
      <p className="text-slate-500">Remembered on this device only, so your phone and computer can differ.</p>
    </Section>
  );
}

// ---------- My public library (Libby) ----------
// Accepts "nypl" or a pasted Libby link like https://libbyapp.com/library/nypl/...
export const libbyKeyFrom = (text) => {
  const t = String(text || '').trim();
  const fromLink = t.match(/libbyapp\.com\/(?:library|search)\/([a-z0-9-]+)/i);
  return (fromLink ? fromLink[1] : t).toLowerCase().replace(/[^a-z0-9-]/g, '');
};

function LibrarySection({ prefs, onPrefsChange }) {
  const [text, setText] = useState(prefs?.libbyLibrary || '');
  const [message, setMessage] = useState('');
  useEffect(() => { setText(prefs?.libbyLibrary || ''); }, [prefs?.libbyLibrary]);
  const save = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      const saved = await api.setPrefs({ libbyLibrary: libbyKeyFrom(text) });
      onPrefsChange?.(saved);
      setMessage(saved.libbyLibrary ? 'Saved. Books now have a "Borrow (Libby)" link.' : 'Removed.');
    } catch (err) {
      setMessage(err.message);
    }
  };
  return (
    <Section icon={Library} title="My public library (Libby)">
      <p className="text-slate-500">
        To get a "Borrow from my library" link on every book: open <a href="https://libbyapp.com" target="_blank" rel="noreferrer" className="text-orange-600 underline">libbyapp.com</a>, choose your library,
        then copy the address from the top of the page and paste it here (or just the short name after <b>/library/</b>, like <b>nypl</b>).
      </p>
      <form onSubmit={save} className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. nypl or https://libbyapp.com/library/nypl" aria-label="Libby library" className={inputClass} />
        <button type="submit" className={buttonClass}>Save</button>
      </form>
      {message && <p className="text-emerald-700">{message}</p>}
    </Section>
  );
}

// ---------- Hardcover ----------
function HardcoverSection({ settings, onChange }) {
  const [token, setToken] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const hc = settings?.hardcover || {};

  const connect = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');
    try {
      onChange({ ...settings, hardcover: await api.connectHardcover(token) });
      setToken('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('Disconnect Hardcover? Series you already have stay; new books won\'t get series filled in automatically.')) return;
    setIsSaving(true);
    try {
      onChange({ ...settings, hardcover: await api.disconnectHardcover() });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Section icon={Database} title="Hardcover (series information)">
      <p className="text-slate-500">
        Hardcover is a free book site with excellent series data. When connected, books are put in their series
        automatically, and the Series page shows the books you're missing.
      </p>
      {hc.connected ? (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">Connected{hc.username ? <> as <b>@{hc.username}</b></> : ' to Hardcover'}.</span>
          {settings.isOwner && <button onClick={disconnect} disabled={isSaving} className="font-semibold underline">Disconnect</button>}
        </div>
      ) : settings?.isOwner ? (
        <form onSubmit={connect} className="space-y-3">
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>
              Make a free account at{' '}
              <a href="https://hardcover.app/join" target="_blank" rel="noreferrer" className="text-orange-600 font-semibold underline inline-flex items-center gap-0.5">
                hardcover.app <ExternalLink className="w-3 h-3" />
              </a>{' '}(or sign in).
            </li>
            <li>
              Open{' '}
              <a href="https://hardcover.app/account/api" target="_blank" rel="noreferrer" className="text-orange-600 font-semibold underline inline-flex items-center gap-0.5">
                API Access <ExternalLink className="w-3 h-3" />
              </a>{' '}
              and click <b>Create key</b>: any name, expiration <b>Never</b>, permission <b>read:catalog</b> only.
            </li>
            <li>Copy the key it shows (it's only shown once), paste it below and tap <b>Connect</b>.</li>
          </ol>
          <textarea value={token} onChange={(e) => setToken(e.target.value)} rows={3} placeholder="Paste your Hardcover API key here" className={`${inputClass} font-mono text-[11px]`} />
          <button type="submit" disabled={isSaving || !token.trim()} className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-1.5">
            {isSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />} Connect
          </button>
        </form>
      ) : (
        <p className="p-3 bg-slate-50 border border-slate-200 rounded-xl">Not connected. Ask the library's owner to connect Hardcover.</p>
      )}
      {error && <p className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}</p>}
    </Section>
  );
}

// ---------- Your account ----------
function PasswordSection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [message, setMessage] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);
    try {
      await api.changePassword(current, next);
      setMessage({ ok: true, text: 'Password changed. Your other devices will need to sign in again.' });
      setCurrent('');
      setNext('');
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Section icon={Lock} title="Change my password">
      <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input type="password" autoComplete="current-password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} />
        <input type="password" autoComplete="new-password" placeholder="New password (8+ characters)" value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} />
        <button type="submit" disabled={isSaving || !current || next.length < 8} className={buttonClass}>
          {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />} Change
        </button>
      </form>
      {message && <p className={message.ok ? 'text-emerald-700' : 'text-red-600'}>{message.text}</p>}
    </Section>
  );
}

// ---------- Install ----------
function InstallSection() {
  const [canPrompt, setCanPrompt] = useState(Boolean(window.__installPrompt));
  const installed = window.matchMedia?.('(display-mode: standalone)').matches;

  const install = async () => {
    const prompt = window.__installPrompt;
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice.catch(() => {});
    window.__installPrompt = null;
    setCanPrompt(false);
  };

  return (
    <Section icon={Smartphone} title="Put the app on your home screen">
      {installed ? (
        <p className="text-emerald-700 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> You're using the installed app.</p>
      ) : canPrompt ? (
        <button onClick={install} className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl">Install the app</button>
      ) : (
        <ul className="list-disc pl-5 space-y-1 text-slate-600">
          <li><b>Android (Chrome):</b> tap the <b>⋮</b> menu, then <b>Add to Home screen</b> or <b>Install app</b>.</li>
          <li><b>iPhone (Safari):</b> tap the <b>Share</b> button, then <b>Add to Home Screen</b>.</li>
          {!window.isSecureContext && (
            <li className="text-amber-700">Your address isn't secure (http://), so it opens like a bookmark rather than a full app.</li>
          )}
        </ul>
      )}
    </Section>
  );
}

// ---------- Owner: who can sign up, and invite codes ----------
function SignupsAndInvites({ mode, onModeChange }) {
  const [invites, setInvites] = useState(null);
  const [note, setNote] = useState('');
  const [days, setDays] = useState(7);
  const [circle, setCircle] = useState('family');
  const [copied, setCopied] = useState(null);
  const [error, setError] = useState('');
  const load = () => api.listInvites().then(setInvites).catch(err => setError(err.message));
  useEffect(() => { load(); }, []);

  const linkFor = (code) => `${window.location.origin}/?invite=${code}`;
  const copy = async (code) => {
    try {
      await navigator.clipboard.writeText(`You're invited to my book library! Open ${linkFor(code)} to create your account (invite code ${code}).`);
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError(`Couldn't copy. The link is: ${linkFor(code)}`);
    }
  };
  const create = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const { code } = await api.createInvite(note.trim(), days, circle);
      setNote('');
      await load();
      copy(code);
    } catch (err) {
      setError(err.message);
    }
  };
  const revoke = async (code) => {
    await api.revokeInvite(code).catch(err => setError(err.message));
    load();
  };
  const chip = { active: 'bg-emerald-100 text-emerald-800', used: 'bg-slate-100 text-slate-600', expired: 'bg-amber-100 text-amber-800' };

  return (
    <div className="space-y-3">
      <div className="p-3 bg-slate-50 rounded-xl space-y-1.5">
        <p className="font-bold text-slate-900">Who can create an account?</p>
        {[
          ['invite', 'Only people with an invite code', '(recommended)'],
          ['open', 'Anyone who finds the website', ''],
          ['closed', 'Nobody (no new accounts)', '']
        ].map(([value, label, hint]) => (
          <label key={value} className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="signup-mode" checked={mode === value} onChange={() => onModeChange(value)} className="accent-orange-500" />
            <span>{label} <span className="text-slate-400">{hint}</span></span>
          </label>
        ))}
      </div>

      {mode === 'invite' && (
        <div className="space-y-2">
          <form onSubmit={create} className="flex gap-2 flex-wrap">
            <div className="w-full flex gap-2" role="radiogroup" aria-label="This person is">
              <span className="self-center text-slate-500">This person is:</span>
              {[['family', 'Family'], ['friend', 'A friend']].map(([value, label]) => (
                <button key={value} type="button" role="radio" aria-checked={circle === value} onClick={() => setCircle(value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${circle === value ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>
                  {label}
                </button>
              ))}
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Who is it for? (optional)" className={`${inputClass} flex-1 min-w-[9rem]`} />
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Valid for" className="px-2 py-2 border border-slate-200 rounded-xl text-xs bg-white">
              <option value={1}>1 day</option>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
            </select>
            <button type="submit" className="px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold">Create invite</button>
          </form>
          <p className="text-[11px] text-slate-400">Each code works for one person. Creating one copies a ready-to-send message with the link. Friends get their own library but not the family features (Family Shelves, Challenges). You can change this later below.</p>
          {error && <p className="text-red-600">{error}</p>}
          {invites && invites.length > 0 && (
            <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {invites.map(inv => (
                <li key={inv.code} className="p-2.5 flex items-center gap-2">
                  <code className="font-mono font-bold text-slate-900 tracking-wider">{inv.code}</code>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${chip[inv.status]}`}>{inv.status === 'used' ? `used by ${inv.usedBy || '?'}` : inv.status}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${inv.circle === 'friend' ? 'bg-sky-50 text-sky-700' : 'bg-orange-50 text-orange-700'}`}>{inv.circle === 'friend' ? 'Friend' : 'Family'}</span>
                  <span className="flex-1 min-w-0 truncate text-[11px] text-slate-400">{inv.note || ''}</span>
                  {inv.status === 'active' && (
                    <>
                      <button onClick={() => copy(inv.code)} className="text-[11px] font-semibold text-orange-600">{copied === inv.code ? 'Copied!' : 'Copy link'}</button>
                      <button onClick={() => revoke(inv.code)} className="text-[11px] font-semibold text-slate-500">Revoke</button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Owner: accounts, sign-ups, backups ----------
function OwnerSection({ currentUserId }) {
  const [data, setData] = useState(null);
  const [backups, setBackups] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setData(await api.listUsers());
      setBackups(await api.listBackups());
    } catch (err) {
      setError(err.message);
    }
  };
  useEffect(() => { load(); }, []);

  const act = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = (u) => {
    const password = prompt(`New password for ${u.displayName} (at least 8 characters). Tell them, and they can change it in Settings.`);
    if (!password) return;
    act(() => api.resetUserPassword(u.id, password));
  };
  const removeUser = (u) => {
    if (!confirm(`Remove ${u.displayName}'s account and all ${u.bookCount} of their books? This can't be undone (except from a backup).`)) return;
    act(() => api.removeUser(u.id));
  };

  const size = (bytes) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

  return (
    <>
      <Section icon={Users} title="Accounts: family and friends">
        <p className="text-slate-500"><b>Family</b> can share shelves and join Family Challenges. <b>Friends</b> have their own library but don't see or appear in the family features.</p>
        {error && <p className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl">{error}</p>}
        {!data ? (
          <p className="text-slate-400 flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading…</p>
        ) : (
          <>
            <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {data.users.map(u => (
                <li key={u.id} className="p-3 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${u.color} flex items-center justify-center text-white font-bold flex-shrink-0`}>
                    {u.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 truncate">{u.displayName} {u.role === 'Owner' && <span className="text-[10px] text-orange-600">(Owner)</span>}</div>
                    <div className="text-[11px] text-slate-400 truncate">{u.email} · {u.bookCount} books</div>
                  </div>
                  {u.role === 'Owner' ? (
                    <span className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-orange-50 text-orange-700">Family</span>
                  ) : (
                    <select value={u.circle} disabled={busy} aria-label={`${u.displayName} is`}
                      onChange={(e) => act(() => api.setCircle(u.id, e.target.value))}
                      className={`px-2 py-1.5 border rounded-lg text-[11px] font-semibold ${u.circle === 'friend' ? 'bg-sky-50 border-sky-200 text-sky-700' : 'bg-orange-50 border-orange-200 text-orange-700'}`}>
                      <option value="family">Family</option>
                      <option value="friend">Friend</option>
                    </select>
                  )}
                  {u.id !== currentUserId && (
                    <div className="flex gap-1.5">
                      <button onClick={() => resetPassword(u)} disabled={busy} className={buttonClass} title="Set a new password"><KeyRound className="w-3.5 h-3.5" /><span className="hidden sm:inline">Password</span></button>
                      <button onClick={() => removeUser(u)} disabled={busy} className={`${buttonClass} text-red-600`} title="Remove account"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
<SignupsAndInvites mode={data.signupMode} onModeChange={(mode) => { setData(prev => ({ ...prev, signupMode: mode })); act(() => api.setSignupMode(mode)); }} />
          </>
        )}
      </Section>

      <Section icon={Database} title="Backups">
        <p className="text-slate-500">
          A copy of everyone's books and accounts is saved automatically every day, keeping the last 7, in your server's
          <code className="mx-1 px-1 bg-slate-100 rounded">appdata/personal-library/backups</code> folder. Covers are in the
          <code className="mx-1 px-1 bg-slate-100 rounded">covers</code> folder next to it.
        </p>
        {backups && backups.length > 0 && (
          <ul className="text-[11px] text-slate-600 space-y-0.5">
            {backups.map(b => <li key={b.file}>• {b.date} — {size(b.bytes)}</li>)}
          </ul>
        )}
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => act(async () => setBackups(await api.backupNow()))} disabled={busy} className={buttonClass}>
            {busy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />} Back up now
          </button>
          <a href="/api/admin/backup/download" className={buttonClass}><Download className="w-3.5 h-3.5" /> Download a full backup</a>
        </div>
      </Section>
    </>
  );
}

// Settings window: account, data, install, Hardcover and (for the owner) the library's settings.
// "Share my library with the family": lets family members see the books on your shelves.
function SharingToggle({ onChange }) {
  const [sharing, setSharing] = useState(null);
  useEffect(() => { api.getSharing().then(setSharing).catch(() => setSharing(false)); }, []);
  if (sharing === null) return null;
  return (
    <label className="flex items-start gap-2 p-3 bg-slate-50 rounded-xl cursor-pointer">
      <input
        type="checkbox"
        checked={sharing}
        onChange={async (e) => {
          const next = e.target.checked;
          setSharing(next);
          try { setSharing(await api.setSharing(next)); onChange?.(); } catch { setSharing(!next); }
        }}
        className="w-4 h-4 mt-0.5 accent-orange-500"
      />
      <span><b>Share my library with the family.</b> They'll see the books on your shelves in "Family Shelves" (not your notes or wishlist).</span>
    </label>
  );
}

export default function SettingsModal({ settings, currentUser, onChange, onClose, onFamilyChange, onImport, prefs, onPrefsChange, books, onBookSaved }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-4">
      <div className="bg-white sm:rounded-3xl shadow-2xl max-w-lg w-full flex flex-col h-full sm:h-auto sm:max-h-[92vh] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-orange-500" />
            <h3 className="text-sm font-bold text-slate-900">Settings</h3>
          </div>
          <button onClick={onClose} aria-label="Close settings" className="w-8 h-8 rounded-full bg-slate-200/60 hover:bg-slate-200 flex items-center justify-center text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto text-xs text-slate-700">
          <Section icon={Download} title="My books">
            <p className="text-slate-500">Download all your books as a spreadsheet (opens in Excel, Google Sheets or Numbers), or bring in your books from Goodreads.</p>
            <a href="/api/export/books.csv" className={buttonClass}><Download className="w-3.5 h-3.5" /> Download my books (spreadsheet)</a>
            <button onClick={onImport} className={buttonClass}><Upload className="w-3.5 h-3.5" /> Import from Goodreads</button>
            <FillInfoButton books={books} onBookSaved={onBookSaved} />
            <FixAuthorsButton books={books} onBookSaved={onBookSaved} />
            {currentUser?.circle !== 'friend' && <SharingToggle onChange={onFamilyChange} />}
          </Section>
          <ActivitySection />
          <MenuSection prefs={prefs} onPrefsChange={onPrefsChange} isFamily={currentUser?.circle !== 'friend'} />
          <AppearanceSection />
          <LibrarySection prefs={prefs} onPrefsChange={onPrefsChange} />
          <InstallSection />
          <PasswordSection />
          <HardcoverSection settings={settings} onChange={onChange} />
          {settings?.isOwner && <OwnerSection currentUserId={currentUser?.id} />}
        </div>
      </div>
    </div>
  );
}
