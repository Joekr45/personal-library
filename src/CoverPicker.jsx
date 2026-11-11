import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, RefreshCw, Camera, Link2, CheckCircle2, ImageOff } from 'lucide-react';
import { api } from './api.js';

// Shrink a photo from the phone to a sensible size before sending it to the server.
export function photoToDataUrl(file, maxSide = 900) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be opened as a picture.'));
    };
    img.src = url;
  });
}

// A window showing every cover we can find for a book, labelled by edition, plus the
// option to use a photo of your own copy or paste a link to a picture.
//
// onChoose receives one of:
//   { url, option }        a cover from the list (option has the edition's language, year, publisher, isbn13)
//   { url }                a pasted link
//   { imageData }          a photo (data URL)
export default function CoverPicker({ title, author, isbn, workKey, language, onChoose, onCancel }) {
  const [state, setState] = useState({ loading: true, options: [], languages: [], error: '' });
  const [broken, setBroken] = useState(() => new Set());
  const [filter, setFilter] = useState(language || 'All');
  const [selected, setSelected] = useState(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState('');
  const [photoError, setPhotoError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    api.getCoverOptions({ isbn, workKey, title, author, language })
      .then(data => {
        if (cancelled) return;
        setState({ loading: false, options: data.options || [], languages: data.languages || [], error: '' });
        if (!(data.languages || []).includes(language)) setFilter('All');
      })
      .catch(err => !cancelled && setState({ loading: false, options: [], languages: [], error: err.message }));
    return () => { cancelled = true; };
  }, [isbn, workKey, title, author, language]);

  const markBroken = (url) => setBroken(prev => new Set(prev).add(url));

  const visible = useMemo(
    () => state.options.filter(o => !broken.has(o.url) && (filter === 'All' || o.language === filter || o.thisEdition)),
    [state.options, broken, filter]
  );

  const choosePhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError('');
    try {
      onChoose({ imageData: await photoToDataUrl(file) });
    } catch (err) {
      setPhotoError(err.message);
    }
  };

  const label = (o) => [o.year, o.publisher].filter(Boolean).join(' · ');

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/70 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-4">
      <div className="bg-white sm:rounded-3xl shadow-2xl max-w-2xl w-full flex flex-col h-full sm:h-auto sm:max-h-[92vh] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900">Choose a Cover</h3>
            <p className="text-[11px] text-slate-500 truncate">{title}{author ? ` · ${author}` : ''}</p>
          </div>
          <button onClick={onCancel} aria-label="Close cover picker" className="w-8 h-8 rounded-full bg-slate-200/60 hover:bg-slate-200 flex items-center justify-center text-slate-600 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {state.languages.length > 1 && (
          <div className="px-4 pt-3 flex gap-1.5 flex-wrap">
            {['All', ...state.languages].map(lang => (
              <button
                key={lang}
                onClick={() => setFilter(lang)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold border ${
                  filter === lang ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
        )}

        <div className="p-4 overflow-y-auto flex-1">
          {state.loading && (
            <div className="py-12 flex flex-col items-center gap-2 text-xs text-slate-500">
              <RefreshCw className="w-5 h-5 animate-spin" /> Finding covers for every edition…
            </div>
          )}
          {!state.loading && state.error && <p className="text-xs text-red-600">{state.error}</p>}
          {!state.loading && !state.error && visible.length === 0 && (
            <div className="py-10 flex flex-col items-center gap-2 text-xs text-slate-500 text-center">
              <ImageOff className="w-6 h-6" />
              <p>No covers found online{filter !== 'All' ? ` in ${filter}` : ''}.<br />Take a photo of your copy instead.</p>
            </div>
          )}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {visible.map(o => (
              <button
                key={o.url}
                type="button"
                onClick={() => setSelected(o)}
                className={`text-left rounded-xl p-1 border-2 transition-all ${
                  selected?.url === o.url ? 'border-orange-500 bg-orange-50' : 'border-transparent hover:border-slate-200'
                }`}
              >
                <div className="aspect-[2/3] bg-slate-100 rounded-lg overflow-hidden">
                  <img
                    src={o.url}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover"
                    onError={() => markBroken(o.url)}
                    onLoad={(e) => { if (e.currentTarget.naturalWidth < 10) markBroken(o.url); }}
                  />
                </div>
                <div className="mt-1 space-y-0.5">
                  {o.thisEdition
                    ? <span className="inline-block text-[9px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">This edition</span>
                    : <span className="inline-block text-[9px] font-bold uppercase tracking-wide bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{o.language || 'Edition'}</span>}
                  <div className="text-[10px] text-slate-500 leading-tight line-clamp-2">{label(o) || o.source}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 space-y-2 bg-white">
          {linkOpen && (
            <form
              className="flex gap-2"
              onSubmit={(e) => { e.preventDefault(); if (link.trim()) onChoose({ url: link.trim() }); }}
            >
              <input
                type="url"
                autoFocus
                placeholder="https://… link to a picture of the cover"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orange-500"
              />
              <button type="submit" className="px-3 py-2 bg-slate-800 text-white rounded-xl text-xs font-semibold">Use link</button>
            </form>
          )}
          {photoError && <p className="text-xs text-red-600">{photoError}</p>}
          <div className="flex gap-2 flex-wrap">
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={choosePhoto} />
            <button type="button" onClick={() => fileRef.current?.click()} className="px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5" /> Photo of my copy
            </button>
            <button type="button" onClick={() => setLinkOpen(v => !v)} className="px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5" /> Paste a link
            </button>
            <button
              type="button"
              disabled={!selected}
              onClick={() => onChoose({ url: selected.url, option: selected })}
              className="ml-auto px-4 py-2 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Use this cover
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
