import React, { useState } from 'react';
import { X, Settings, CheckCircle2, RefreshCw, ExternalLink, AlertTriangle } from 'lucide-react';
import { api } from './api.js';

// Library settings. For now: connecting Hardcover, which fills in series information.
export default function SettingsModal({ settings, onChange, onClose }) {
  const [token, setToken] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const hc = settings?.hardcover || {};

  const connect = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');
    try {
      const hardcover = await api.connectHardcover(token);
      onChange({ ...settings, hardcover });
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

        <div className="p-5 space-y-4 overflow-y-auto text-xs text-slate-700">
          <div>
            <h4 className="text-sm font-bold text-slate-900">Hardcover (series information)</h4>
            <p className="mt-1 text-slate-500">
              Hardcover is a free book site with excellent series data. When connected, books are put in their series
              automatically, and the Series page shows the books you're missing.
            </p>
          </div>

          {hc.connected ? (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">Connected{hc.username ? <> as <b>@{hc.username}</b></> : null}.</span>
              {settings.isOwner && (
                <button onClick={disconnect} disabled={isSaving} className="font-semibold underline">Disconnect</button>
              )}
            </div>
          ) : settings?.isOwner ? (
            <form onSubmit={connect} className="space-y-3">
              <ol className="list-decimal pl-5 space-y-1.5">
                <li>
                  Make a free account at{' '}
                  <a href="https://hardcover.app/join" target="_blank" rel="noreferrer" className="text-orange-600 font-semibold underline inline-flex items-center gap-0.5">
                    hardcover.app <ExternalLink className="w-3 h-3" />
                  </a>{' '}
                  (or sign in).
                </li>
                <li>
                  Open{' '}
                  <a href="https://hardcover.app/account/api" target="_blank" rel="noreferrer" className="text-orange-600 font-semibold underline inline-flex items-center gap-0.5">
                    Settings → Hardcover API <ExternalLink className="w-3 h-3" />
                  </a>{' '}
                  and copy the long code shown there.
                </li>
                <li>Paste it below and tap <b>Connect</b>.</li>
              </ol>
              <textarea
                value={token}
                onChange={(e) => setToken(e.target.value)}
                rows={3}
                placeholder="Paste your Hardcover API code here"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-[11px] focus:outline-none focus:border-orange-500"
              />
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
                </div>
              )}
              <button type="submit" disabled={isSaving || !token.trim()} className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-1.5">
                {isSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />} Connect
              </button>
              <p className="text-[11px] text-slate-400">
                The code is kept on your server only and is never shown again. Hardcover codes expire after a while; if series
                stop filling in, connect again with a new code.
              </p>
            </form>
          ) : (
            <p className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              Not connected. Ask the library's owner to connect Hardcover in their Settings.
            </p>
          )}
          {error && hc.connected && <p className="text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
