import React, { useEffect, useState } from 'react';
import { PenLine, Check } from 'lucide-react';
import { today } from './reading.js';

// "My review": like notes, but you can share it with family and friends.
export default function ReviewPanel({ book, onUpdate }) {
  const [text, setText] = useState(book.review?.text || '');
  const [isPublic, setIsPublic] = useState(book.review?.public ?? true);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setText(book.review?.text || ''); setIsPublic(book.review?.public ?? true); }, [book.id]);
  const dirty = text.trim() !== (book.review?.text || '') || (text.trim() && isPublic !== (book.review?.public ?? true));

  const save = async () => {
    const result = await onUpdate({ review: text.trim() ? { text: text.trim(), public: isPublic, updatedOn: today() } : null });
    if (result) { setSaved(true); setTimeout(() => setSaved(false), 1500); }
  };

  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800"><PenLine className="w-4 h-4 text-orange-500" /> My review</span>
        {saved && <span className="text-[11px] text-emerald-700 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Saved</span>}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} aria-label="My review"
        placeholder="What did you think? (Your private notes stay separate.)"
        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:border-orange-500" />
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="accent-orange-500" />
          Share with family &amp; friends
        </label>
        <button onClick={save} disabled={!dirty} className="ml-auto px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-lg text-xs font-semibold">
          Save review
        </button>
      </div>
    </div>
  );
}
