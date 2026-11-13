import React, { useEffect, useRef, useState } from 'react';
import {
  ScanBarcode, X, RefreshCw, AlertTriangle, CheckCircle2, Search, Keyboard, Heart, Library, BookOpen, Info, ImagePlus, ArrowLeft,
  BadgeCheck, Users, Layers, Trash2
} from 'lucide-react';
import { api } from './api.js';
import CoverPicker from './CoverPicker.jsx';
import { LANGUAGES } from './languages.js';
import { sameBook } from './matching.js';
import { classifyCode, toIsbn13 } from '../shared/isbn.js';

// Same idea as the server's normalizeTitle: used to spot books already in the library.
const normalizeTitle = (title) =>
  String(title || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9]/g, '');

const playBeep = () => {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
    if (navigator.vibrate) navigator.vibrate(100);
  } catch {
    // sound blocked — not important
  }
};

// Reads one video frame with ZXing (used on browsers without a built-in barcode reader, e.g. iPhone).
function decodeWithZxing(video, canvas) {
  const ZX = window.ZXing;
  if (!ZX || !video.videoWidth) return null;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0);
  try {
    if (!window._plZxingReader) {
      const hints = new Map();
      hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [ZX.BarcodeFormat.EAN_13, ZX.BarcodeFormat.EAN_8, ZX.BarcodeFormat.UPC_A, ZX.BarcodeFormat.UPC_E]);
      window._plZxingReader = new ZX.MultiFormatReader();
      window._plZxingReader.setHints(hints);
    }
    const source = new ZX.HTMLCanvasElementLuminanceSource(canvas);
    const bitmap = new ZX.BinaryBitmap(new ZX.HybridBinarizer(source));
    return window._plZxingReader.decode(bitmap)?.getText() || null;
  } catch {
    return null; // no barcode in this frame
  }
}

const TABS = [
  { id: 'camera', label: 'Scan', icon: ScanBarcode },
  { id: 'isbn', label: 'Type ISBN', icon: Keyboard },
  { id: 'search', label: 'Find by Title', icon: Search },
  { id: 'shelf', label: 'Whole Shelf', icon: Layers },
  { id: 'check', label: 'Own it?', icon: BadgeCheck }
];

// The "Add a book" window: scan a barcode, type an ISBN, or search by title/author.
// initialBook: open straight to the confirmation card for this book (e.g. from the author page);
// the window then closes after the book is added.
export default function ScannerModal({ books, onClose, onAdd, onSaveCover, onManualAdd, coverThemes, initialBook = null, family = null, initialMode = null }) {
  const [mode, setMode] = useState(initialBook ? 'search' : initialMode || 'camera');
  // "Scan" and "Do I own it?" both use the camera.
  const usesCamera = mode === 'camera' || mode === 'check' || mode === 'shelf';
  // "Whole Shelf": scan book after book without stopping; they collect in a list and are added together.
  const [shelfQueue, setShelfQueue] = useState([]); // [{ isbn13, status: 'looking'|'found'|'notfound'|'have', book }]
  const shelfQueueRef = useRef(shelfQueue);
  shelfQueueRef.current = shelfQueue;
  const [shelfInput, setShelfInput] = useState('');
  const [shelfNote, setShelfNote] = useState('');
  const [shelfAdding, setShelfAdding] = useState(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [checkResult, setCheckResult] = useState(null);
  const [checkInput, setCheckInput] = useState('');

  // camera
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const detectorRef = useRef(null);
  const canvasRef = useRef(null);
  const busyRef = useRef(false);
  const [cameraState, setCameraState] = useState('idle'); // idle | starting | scanning | paused | error
  const [cameraError, setCameraError] = useState('');

  // lookup
  const [isbnInput, setIsbnInput] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [notice, setNotice] = useState(null); // { type: 'upc'|'invalid'|'notfound'|'duplicate'|'error', ... }
  const [result, setResult] = useState(null); // the book about to be added (from a scan, ISBN or title search)
  const [coverChoice, setCoverChoice] = useState(null); // { url } or { imageData }
  const [coverBroken, setCoverBroken] = useState(false);
  const [copyLanguage, setCopyLanguage] = useState('English');
  const [isPickingCover, setIsPickingCover] = useState(false);
  const [lastAdded, setLastAdded] = useState(null);

  // title search
  const [searchTitle, setSearchTitle] = useState('');
  const [searchAuthor, setSearchAuthor] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [searchError, setSearchError] = useState('');

  const booksRef = useRef(books);
  booksRef.current = books;

  useEffect(() => {
    if (initialBook) showResult({ ...initialBook, fromSearch: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- camera ----------
  const stopCamera = () => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  const startScanLoop = () => {
    clearInterval(timerRef.current);
    busyRef.current = false;
    setCameraState('scanning');
    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    timerRef.current = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || busyRef.current) return;
      busyRef.current = true;
      try {
        let text = null;
        if (detectorRef.current) {
          const codes = await detectorRef.current.detect(video);
          text = codes?.[0]?.rawValue?.trim() || null;
        } else {
          text = decodeWithZxing(video, canvasRef.current);
        }
        if (text) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          setCameraState('paused');
          playBeep();
          if (modeRef.current === 'shelf') {
            queueShelfCode(text);
            setTimeout(() => { if (modeRef.current === 'shelf') startScanLoop(); }, 1200); // a moment to move to the next book
            return;
          }
          await (modeRef.current === 'check' ? runCheck(text) : lookUp(text));
          return;
        }
      } catch {
        // ignore a bad frame
      }
      busyRef.current = false;
    }, 250);
  };

  const startCamera = async () => {
    setCameraError('');
    setCameraState('starting');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(window.isSecureContext
          ? 'This browser can\'t use the camera.'
          : 'Your browser only allows the camera on secure (https://) addresses. Use "Type ISBN" or "Find by Title" instead for now.');
      }
      if (!detectorRef.current && 'BarcodeDetector' in window) {
        try {
          detectorRef.current = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        } catch {
          detectorRef.current = null;
        }
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      startScanLoop();
    } catch (err) {
      setCameraState('error');
      setCameraError(err?.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow camera access for this site in your browser settings, or use "Type ISBN".'
        : err?.message || 'Could not start the camera.');
    }
  };

  useEffect(() => {
    if (mode === 'camera' || mode === 'check' || mode === 'shelf') startCamera();
    else stopCamera();
    return stopCamera;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // ---------- lookup ----------
  const resetResult = () => {
    setNotice(null);
    setResult(null);
    setCoverChoice(null);
    setCoverBroken(false);
    setIsPickingCover(false);
  };

  const showResult = (book) => {
    setResult(book);
    setCoverChoice(book.covers?.[0] ? { url: book.covers[0].url } : null);
    setCoverBroken(false);
    setCopyLanguage(LANGUAGES.includes(book.language) ? book.language : 'English');
  };

  const scanAgain = () => {
    resetResult();
    if (usesCamera) startScanLoop();
  };

  // ---------- "Do I own it?" ----------
  // Checks a barcode against your library (any edition) and the family's shared shelves,
  // without adding anything.
  const familyOwners = (candidate) => (family?.members || [])
    .filter(m => m.books.some(b => sameBook(b, candidate)))
    .map(m => m.displayName);

  const runCheck = async (raw) => {
    resetResult();
    setCheckResult(null);
    setLastAdded(null);
    const code = classifyCode(raw);
    if (code.kind === 'invalid') { setNotice({ type: 'invalid', message: code.reason }); return; }
    if (code.kind === 'upc') { setNotice({ type: 'upc', code: code.code }); return; }
    const exact = booksRef.current.find(b => sameBook(b, { isbns: [code.isbn13] }) === 'edition');
    if (exact) {
      setCheckResult({ status: exact.owned === false ? 'wishlist' : 'owned', exactEdition: true, book: exact, family: familyOwners({ isbns: [code.isbn13], workTitle: exact.workTitle, author: exact.author, workKey: exact.workKey }) });
      return;
    }
    setIsLookingUp(true);
    try {
      const data = await api.lookupCode(code.isbn13);
      const info = data.found ? data.book : null;
      const candidate = info ? { title: info.title, authors: info.authors, workKey: info.workKey, isbns: [code.isbn13] } : { isbns: [code.isbn13] };
      const other = info && booksRef.current.find(b => sameBook(b, candidate));
      setCheckResult({
        status: other ? (other.owned === false ? 'wishlist' : 'owned') : 'new',
        exactEdition: false,
        book: other || null,
        info,
        isbn13: code.isbn13,
        family: familyOwners(candidate)
      });
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setIsLookingUp(false);
    }
  };

  const checkAnother = () => {
    setCheckResult(null);
    setCheckInput('');
    scanAgain();
  };

  const lookUp = async (raw) => {
    resetResult();
    setLastAdded(null);
    const code = classifyCode(raw);
    if (code.kind === 'invalid') {
      setNotice({ type: 'invalid', message: code.reason });
      return;
    }
    if (code.kind === 'upc') {
      setNotice({ type: 'upc', code: code.code });
      return;
    }
    const existing = booksRef.current.find(b => (b.editions || []).some(e => toIsbn13(e.isbn) === code.isbn13));
    if (existing) {
      setNotice({ type: 'duplicate', book: existing });
      return;
    }
    setIsLookingUp(true);
    try {
      const data = await api.lookupCode(code.isbn13);
      if (!data.found) {
        setNotice({ type: 'notfound', isbn: code.isbn13 });
      } else {
        showResult(data.book);
      }
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setIsLookingUp(false);
    }
  };

  // If the suggested cover doesn't load, quietly try the next one from the catalogs.
  const failedCoversRef = useRef(new Set());
  const onCoverError = () => {
    if (coverChoice?.url) failedCoversRef.current.add(coverChoice.url);
    const next = !coverChoice?.picked && (result?.covers || []).find(c => !failedCoversRef.current.has(c.url));
    if (next) setCoverChoice({ url: next.url });
    else setCoverBroken(true);
  };

  const handleCoverPicked = (choice) => {
    setIsPickingCover(false);
    setCoverBroken(false);
    setCoverChoice({ ...choice, picked: true });
    // When the book came from a title search we don't know its exact edition yet:
    // picking an edition's cover also tells us that edition's ISBN, year and publisher.
    const option = choice.option;
    // (A scanned or typed ISBN is never replaced — that is the copy in your hands.)
    if (option && result && (result.fromSearch || !result.isbn13) && option.isbn13) {
      setResult(prev => ({
        ...prev,
        isbn13: option.isbn13,
        publisher: option.publisher || prev.publisher,
        publishedDate: option.year || prev.publishedDate,
        format: option.format || prev.format,
        editionFromCover: true
      }));
    }
    if (option?.language && result && (result.fromSearch || !result.isbn13) && LANGUAGES.includes(option.language)) setCopyLanguage(option.language);
  };

  const addResult = async (owned) => {
    if (!result) return;
    const book = {
      workTitle: result.title,
      author: result.authors?.length ? result.authors.join(', ') : 'Unknown Author',
      series: result.series || null,
      seriesNumber: result.seriesNumber ?? null,
      hardcoverSeriesId: result.hardcoverSeriesId || null,
      owned,
      readingStatus: 'Unread',
      shelfLocation: owned ? 'Living Room Shelf' : '',
      customCoverUrl: coverChoice?.url || null,
      description: result.description || null,
      workKey: result.workKey || null,
      theme: coverThemes[Math.floor(Math.random() * coverThemes.length)],
      editions: [{
        id: `ed-${Date.now()}`,
        title: result.title,
        language: copyLanguage,
        format: result.format || 'Physical Print',
        isbn: result.isbn13 || 'Pending Scan',
        isbn10: result.isbn10 || null,
        published: result.publishedDate || 'Unknown',
        publisher: result.publisher || 'Unknown',
        pageCount: result.pageCount || null
      }]
    };
    const saved = await onAdd(book);
    if (saved) {
      // Keep a copy of the chosen cover on the server (in the background).
      if (coverChoice) onSaveCover(saved.id, coverChoice.imageData ? { imageData: coverChoice.imageData } : { url: coverChoice.url }, { quiet: true });
      if (initialBook) {
        close();
        return;
      }
      setLastAdded({ title: book.workTitle, owned });
      setIsbnInput('');
      resetResult();
      setCheckResult(null);
      if (usesCamera) startScanLoop();
    }
  };

  // ---------- whole shelf ----------
  const queueShelfCode = async (raw) => {
    const code = classifyCode(raw);
    if (code.kind !== 'isbn') {
      setShelfNote(code.kind === 'upc' ? 'That was a store barcode (UPC), not the ISBN. Skipped it.' : 'Couldn\'t read that barcode. Skipped it.');
      return;
    }
    if (shelfQueueRef.current.some(q => q.isbn13 === code.isbn13)) { setShelfNote('Already in the list.'); return; }
    setShelfNote('');
    const have = booksRef.current.some(b => (b.editions || []).some(e => toIsbn13(e.isbn) === code.isbn13));
    setShelfQueue(prev => [...prev, { isbn13: code.isbn13, status: have ? 'have' : 'looking' }]);
    if (have) return;
    let data = null;
    try { data = await api.lookupCode(code.isbn13); } catch { data = null; }
    setShelfQueue(prev => prev.map(q => (q.isbn13 === code.isbn13
      ? (data?.found ? { ...q, status: 'found', book: data.book } : { ...q, status: 'notfound' })
      : q)));
  };
  const addShelf = async () => {
    setShelfAdding(true);
    let added = 0;
    for (const q of shelfQueueRef.current.filter(x => x.status === 'found')) {
      const r = q.book;
      const saved = await onAdd({
        workTitle: r.title,
        author: r.authors?.length ? r.authors.join(', ') : 'Unknown Author',
        owned: true, readingStatus: 'Unread', shelfLocation: 'Living Room Shelf',
        customCoverUrl: r.covers?.[0]?.url || null,
        description: r.description || null, workKey: r.workKey || null,
        theme: coverThemes[Math.floor(Math.random() * coverThemes.length)],
        editions: [{
          id: `ed-${Date.now()}-${added}`, title: r.title, language: r.language || 'English', format: r.format || 'Physical Print',
          isbn: r.isbn13, isbn10: r.isbn10 || null, published: r.publishedDate || 'Unknown', publisher: r.publisher || 'Unknown', pageCount: r.pageCount || null
        }]
      });
      if (saved) {
        added++;
        if (r.covers?.[0]?.url) onSaveCover(saved.id, { url: r.covers[0].url }, { quiet: true });
        setShelfQueue(prev => prev.filter(x => x.isbn13 !== q.isbn13));
      }
    }
    setShelfAdding(false);
    setShelfNote(added ? `Added ${added} book${added === 1 ? '' : 's'} to your shelf. You can change any cover from the book's page.` : '');
  };

  // ---------- title search ----------
  const runSearch = async (e) => {
    e?.preventDefault();
    if (!searchTitle.trim() && !searchAuthor.trim()) return;
    setIsSearching(true);
    setSearchError('');
    setSearchResults(null);
    setLastAdded(null);
    try {
      setSearchResults(await api.searchCatalog(searchTitle.trim(), searchAuthor.trim()));
    } catch (err) {
      setSearchError(err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const findInLibrary = (r) => booksRef.current.find(b =>
    (r.isbn13 && (b.editions || []).some(e => toIsbn13(e.isbn) === r.isbn13)) ||
    (normalizeTitle(b.workTitle) === normalizeTitle(r.title) &&
      String(b.author || '').toLowerCase().includes(String(r.authors?.[0] || '').toLowerCase().split(' ').pop()))
  );

  // Picking a search result shows the same confirmation card as a scan, with cover and language choice.
  const selectSearchResult = (r) => {
    setLastAdded(null);
    showResult({
      title: r.title,
      subtitle: r.subtitle,
      authors: r.authors,
      publisher: r.publisher,
      publishedDate: r.year,
      language: r.language || 'English',
      isbn13: r.isbn13 || null,
      isbn10: null,
      format: null,
      workKey: r.workKey,
      sources: r.sources,
      fromSearch: true,
      covers: r.cover ? [{ url: r.cover.replace(/-M\.jpg$/, '-L.jpg'), source: r.sources?.[0] }] : []
    });
  };

  const switchMode = (next) => {
    setCheckResult(null);
    resetResult();
    setLastAdded(null);
    setMode(next);
  };

  const close = () => {
    stopCamera();
    onClose();
  };

  // ---------- UI ----------
  const btn = 'px-3 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-stretch sm:items-center justify-center sm:p-4">
      <div className="bg-white sm:rounded-3xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden flex flex-col h-full sm:h-auto sm:max-h-[95vh]">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <ScanBarcode className="w-4 h-4 text-orange-500" />
            <h3 className="text-sm font-bold text-slate-900">Add a Book</h3>
          </div>
          <button onClick={close} aria-label="Close" className="w-8 h-8 rounded-full bg-slate-200/60 hover:bg-slate-200 flex items-center justify-center text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex bg-slate-100 p-1 border-b border-slate-200 text-xs gap-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => switchMode(id)}
              className={`flex-1 py-2.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-1 whitespace-nowrap text-[11px] sm:text-xs ${
                mode === id ? 'bg-white shadow-xs text-orange-600' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {lastAdded && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>
                Added <b>{lastAdded.title}</b> to your {lastAdded.owned ? 'shelf' : 'wishlist'}.
                {mode === 'camera' && ' Ready for the next one.'}
              </span>
            </div>
          )}

          {/* --- Scan / Do I own it? --- */}
          {usesCamera && (
            <div className="space-y-3">
              <div className="relative aspect-[4/3] sm:aspect-video bg-black rounded-2xl overflow-hidden flex items-center justify-center">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-24 border-2 border-orange-400/80 rounded-xl pointer-events-none" />
                {cameraState === 'starting' && <RefreshCw className="absolute w-6 h-6 text-white animate-spin" />}
              </div>
              {cameraState === 'scanning' && !result && !notice && !checkResult && (
                <p className="text-[11px] text-slate-500 text-center">
                  {mode === 'check'
                    ? 'Scan a book in the shop to see if you already have it. Nothing gets added.'
                    : 'Point the camera at the barcode. Hold steady about 15 cm (6 in) away.'}
                </p>
              )}
              {mode === 'check' && !checkResult && (
                <form onSubmit={(e) => { e.preventDefault(); if (checkInput.trim()) { clearInterval(timerRef.current); runCheck(checkInput); } }} className="flex gap-2">
                  <input value={checkInput} onChange={(e) => setCheckInput(e.target.value)} inputMode="numeric" placeholder="…or type the ISBN" className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono" />
                  <button type="submit" disabled={!checkInput.trim()} className="px-3 py-2 bg-slate-800 disabled:opacity-40 text-white rounded-xl text-xs font-semibold">Check</button>
                </form>
              )}
              {cameraError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">{cameraError}</div>
              )}
            </div>
          )}

          {/* --- Whole shelf --- */}
          {mode === 'shelf' && (
            <div className="space-y-3">
              <p className="text-[11px] text-slate-500 text-center">Scan each book's barcode one after another. They collect below, then add them all at once.</p>
              <form onSubmit={(e) => { e.preventDefault(); if (shelfInput.trim()) { queueShelfCode(shelfInput); setShelfInput(''); } }} className="flex gap-2">
                <input value={shelfInput} onChange={(e) => setShelfInput(e.target.value)} inputMode="numeric" placeholder="…or type an ISBN" aria-label="Shelf ISBN" className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono" />
                <button type="submit" disabled={!shelfInput.trim()} className="px-3 py-2 bg-slate-800 disabled:opacity-40 text-white rounded-xl text-xs font-semibold">Add to list</button>
              </form>
              {shelfNote && <p className="text-[11px] text-slate-600 bg-slate-50 rounded-lg p-2">{shelfNote}</p>}
              {shelfQueue.length > 0 && (
                <ul className="border border-slate-200 rounded-xl divide-y divide-slate-100" aria-label="Scanned books">
                  {shelfQueue.map(q => (
                    <li key={q.isbn13} className="p-2.5 flex items-center gap-2.5 text-xs">
                      {q.book?.covers?.[0]?.url ? <img src={q.book.covers[0].url} alt="" className="w-8 h-12 object-cover rounded" /> : <div className="w-8 h-12 rounded bg-slate-100" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{q.book?.title || q.isbn13}</p>
                        <p className="text-[11px] truncate">
                          {q.status === 'looking' && <span className="text-slate-400">Looking it up…</span>}
                          {q.status === 'found' && <span className="text-slate-500">{(q.book.authors || []).join(', ')}</span>}
                          {q.status === 'notfound' && <span className="text-amber-700">Not found in the catalogs — add it with "Type ISBN" later</span>}
                          {q.status === 'have' && <span className="text-emerald-700">Already in your library</span>}
                        </p>
                      </div>
                      <button onClick={() => setShelfQueue(prev => prev.filter(x => x.isbn13 !== q.isbn13))} aria-label="Remove from list" className="text-slate-300 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    </li>
                  ))}
                </ul>
              )}
              {shelfQueue.some(q => q.status === 'found') && (
                <button onClick={addShelf} disabled={shelfAdding || shelfQueue.some(q => q.status === 'looking')} className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">
                  {shelfAdding ? 'Adding…' : `Add all ${shelfQueue.filter(q => q.status === 'found').length} to my shelf`}
                </button>
              )}
            </div>
          )}

          {/* --- Type ISBN --- */}
          {mode === 'isbn' && (
            <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); lookUp(isbnInput); }}>
              <label className="text-[11px] font-semibold text-slate-500 uppercase block" htmlFor="isbn-input">ISBN</label>
              <div className="flex gap-2">
                <input
                  id="isbn-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="e.g. 0-451-12438-3 or 978…"
                  value={isbnInput}
                  onChange={(e) => setIsbnInput(e.target.value)}
                  className="flex-1 min-w-0 px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-500 font-mono"
                />
                <button type="submit" disabled={isLookingUp || !isbnInput.trim()} className={`${btn} bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white`}>
                  {isLookingUp ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  Look up
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                The ISBN is printed on the copyright page (back of the title page) or near the barcode. 10 or 13 digits; dashes are fine.
              </p>
            </form>
          )}

          {isLookingUp && usesCamera && (
            <div className="p-3 text-xs text-slate-600 flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Looking up the book…</div>
          )}

          {/* --- Messages after a scan / lookup --- */}
          {notice?.type === 'upc' && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-3">
              <div className="flex gap-2 text-xs text-amber-900">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">This is a store barcode, not the book's ISBN.</p>
                  <p>
                    Older paperbacks have a grocery-store code (UPC) on the back cover. It doesn't say which book it is.
                    Look for a second barcode <b>inside the front cover</b>, or the <b>ISBN on the copyright page</b> — or search by title.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => switchMode('isbn')} className={`${btn} bg-white border border-amber-300 text-amber-900 hover:bg-amber-100`}>
                  <Keyboard className="w-3.5 h-3.5" /> Type the ISBN
                </button>
                <button onClick={() => switchMode('search')} className={`${btn} bg-white border border-amber-300 text-amber-900 hover:bg-amber-100`}>
                  <Search className="w-3.5 h-3.5" /> Find by title
                </button>
              </div>
              {usesCamera && (
                <button onClick={scanAgain} className={`${btn} w-full text-amber-900 hover:bg-amber-100`}>
                  <ScanBarcode className="w-3.5 h-3.5" /> Scan a different barcode
                </button>
              )}
            </div>
          )}

          {(notice?.type === 'invalid' || notice?.type === 'error') && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800 space-y-2">
              <div className="flex gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0" /><span>{notice.message}</span></div>
              {usesCamera && <button onClick={scanAgain} className="font-semibold underline">Scan again</button>}
            </div>
          )}

          {notice?.type === 'duplicate' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-2">
              <p>
                {notice.book.owned === false
                  ? <>"<b>{notice.book.workTitle}</b>" is already on your wishlist.</>
                  : <>You already own "<b>{notice.book.workTitle}</b>"{notice.book.shelfLocation ? <> (shelf: {notice.book.shelfLocation})</> : null}.</>}
              </p>
              {usesCamera && <button onClick={scanAgain} className="font-semibold underline">Scan another book</button>}
            </div>
          )}

          {notice?.type === 'notfound' && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs text-slate-700">
              <p>
                Couldn't find ISBN <span className="font-mono">{notice.isbn}</span> in Open Library or Google Books.
                Try searching by title, or enter the details yourself.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => switchMode('search')} className={`${btn} bg-white border border-slate-300 hover:bg-slate-100`}>
                  <Search className="w-3.5 h-3.5" /> Find by title
                </button>
                <button onClick={() => { close(); onManualAdd({ isbn: notice.isbn }); }} className={`${btn} bg-white border border-slate-300 hover:bg-slate-100`}>
                  <Keyboard className="w-3.5 h-3.5" /> Enter details
                </button>
              </div>
              {usesCamera && (
                <button onClick={scanAgain} className={`${btn} w-full hover:bg-slate-100`}>
                  <ScanBarcode className="w-3.5 h-3.5" /> Scan another book
                </button>
              )}
            </div>
          )}

          {checkResult && !result && (() => {
            const c = checkResult;
            const style = {
              owned: 'bg-emerald-600 text-white',
              wishlist: 'bg-rose-500 text-white',
              new: 'bg-slate-800 text-white'
            }[c.status];
            const title = c.book?.workTitle || c.info?.title || `ISBN ${c.isbn13}`;
            const heading = c.status === 'owned'
              ? (c.exactEdition ? 'You own this book' : 'You own this book (another edition)')
              : c.status === 'wishlist' ? "It's on your wishlist — buy it!" : 'Not in your library';
            return (
              <div className="rounded-2xl overflow-hidden border border-slate-200">
                <div className={`p-4 ${style}`}>
                  <p className="text-lg font-black flex items-center gap-2">{c.status === 'owned' ? <CheckCircle2 className="w-5 h-5" /> : c.status === 'wishlist' ? <Heart className="w-5 h-5" /> : <Info className="w-5 h-5" />} {heading}</p>
                  <p className="text-sm font-semibold mt-1">{title}</p>
                  {(c.book?.author || c.info?.authors?.length) && <p className="text-xs opacity-90">{c.book?.author || c.info.authors.join(', ')}</p>}
                </div>
                <div className="p-3 bg-white space-y-2 text-xs text-slate-700">
                  {c.status === 'owned' && !c.exactEdition && c.book && (
                    <p>Yours is the {[c.book.editions?.[0]?.language, c.book.editions?.[0]?.format].filter(Boolean).join(' ') || 'other'} edition{c.book.shelfLocation ? `, on ${c.book.shelfLocation}` : ''}.</p>
                  )}
                  {c.status === 'owned' && c.exactEdition && c.book?.shelfLocation && <p>On your shelf: {c.book.shelfLocation}.</p>}
                  {c.family.length > 0 && (
                    <p className="p-2 bg-sky-50 border border-sky-200 rounded-lg text-sky-800 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> {c.family.join(' and ')} {c.family.length === 1 ? 'has' : 'have'} this book.</p>
                  )}
                  {c.status === 'new' && c.info && (
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => { clearInterval(timerRef.current); showResult({ ...c.info, fromSearch: false }); }} className={`${btn} bg-emerald-600 hover:bg-emerald-700 text-white`}>
                        <Library className="w-3.5 h-3.5" /> I'm buying it
                      </button>
                      <button onClick={() => { clearInterval(timerRef.current); showResult({ ...c.info, fromSearch: false }); }} className={`${btn} bg-white border border-rose-200 text-rose-600`}>
                        <Heart className="w-3.5 h-3.5" /> Add to wishlist…
                      </button>
                    </div>
                  )}
                  {c.status === 'new' && !c.info && <p>The catalogs don't know this ISBN, and it's not in your library.</p>}
                  <button onClick={checkAnother} className={`${btn} w-full bg-slate-100 hover:bg-slate-200`}><BadgeCheck className="w-3.5 h-3.5" /> Check another book</button>
                </div>
              </div>
            );
          })()}

          {result && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-3">
              {mode === 'search' && !initialBook && (
                <button onClick={resetResult} className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to results
                </button>
              )}
              <div className="flex gap-4 items-start">
                <button
                  type="button"
                  onClick={() => setIsPickingCover(true)}
                  className="w-24 flex-shrink-0 group"
                  title="Choose a different cover"
                >
                  <div className="w-24 h-36 bg-white rounded-lg border border-emerald-200 overflow-hidden flex items-center justify-center">
                    {coverChoice && !coverBroken
                      ? <img src={coverChoice.url || coverChoice.imageData} alt="" className="w-full h-full object-cover" onError={onCoverError} onLoad={(e) => { if (e.currentTarget.naturalWidth < 10) onCoverError(); }} />
                      : <BookOpen className="w-6 h-6 text-slate-300" />}
                  </div>
                  <span className="mt-1 text-[11px] font-semibold text-orange-600 flex items-center justify-center gap-1">
                    <ImagePlus className="w-3.5 h-3.5" /> Change cover
                  </span>
                </button>
                <div className="text-xs min-w-0 flex-1 space-y-1">
                  <div className="font-bold text-slate-900 text-sm">{result.title}</div>
                  {result.subtitle && <div className="text-slate-600">{result.subtitle}</div>}
                  {result.authors?.length && !result.authorTyped ? (
                    <div className="text-slate-700">by {result.authors.join(', ')}</div>
                  ) : (
                    <label className="block">
                      <span className="text-[11px] text-amber-700 font-semibold">No catalog knows the author. Type it (from the cover):</span>
                      <input value={result.authors?.join(', ') || ''} autoFocus aria-label="Author"
                        onChange={(e) => setResult(prev => ({ ...prev, authorTyped: true, authors: e.target.value ? [e.target.value] : [] }))}
                        placeholder="e.g. Ken Follett" className="mt-0.5 w-full px-2 py-1.5 border border-amber-300 rounded-lg text-xs bg-white" />
                    </label>
                  )}
                  <div className="text-[11px] text-slate-500">
                    {[result.publisher, result.publishedDate, result.format].filter(Boolean).join(' • ')}
                  </div>
                  {result.isbn13 && (
                    <div className="text-[10px] text-slate-400">
                      ISBN {result.isbn13}{result.editionFromCover ? ' (from the cover you picked)' : ''}{result.sources?.length ? ` · found in ${result.sources.join(' & ')}` : ''}
                    </div>
                  )}
                  <label className="block pt-1.5">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Language of my copy</span>
                    <select
                      value={copyLanguage}
                      onChange={(e) => setCopyLanguage(e.target.value)}
                      className="mt-0.5 block w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
                    >
                      {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => addResult(true)} className={`${btn} bg-emerald-600 hover:bg-emerald-700 text-white`}>
                  <Library className="w-3.5 h-3.5" /> Add to My Shelf
                </button>
                <button onClick={() => addResult(false)} className={`${btn} bg-white border border-rose-200 text-rose-600 hover:bg-rose-50`}>
                  <Heart className="w-3.5 h-3.5" /> Add to Wishlist
                </button>
              </div>
              {usesCamera && (
                <button onClick={scanAgain} className={`${btn} w-full text-slate-600 hover:bg-emerald-100`}>
                  Not this book? Scan again
                </button>
              )}
            </div>
          )}

          {isPickingCover && result && (
            <CoverPicker
              title={result.title}
              author={result.authors?.[0] || ''}
              isbn={result.fromSearch ? '' : result.isbn13}
              workKey={result.workKey}
              language={copyLanguage}
              onCancel={() => setIsPickingCover(false)}
              onChoose={handleCoverPicked}
            />
          )}

          {/* --- Find by title --- */}
          {mode === 'search' && !result && (
            <div className="space-y-3">
              <form onSubmit={runSearch} className="space-y-2">
                <input
                  type="text"
                  placeholder="Title (e.g. The Man from St. Petersburg)"
                  value={searchTitle}
                  onChange={(e) => setSearchTitle(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-500"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Author (optional)"
                    value={searchAuthor}
                    onChange={(e) => setSearchAuthor(e.target.value)}
                    className="flex-1 min-w-0 px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-500"
                  />
                  <button type="submit" disabled={isSearching || (!searchTitle.trim() && !searchAuthor.trim())} className={`${btn} bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white`}>
                    {isSearching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    Search
                  </button>
                </div>
              </form>

              {searchError && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">{searchError}</div>}
              {searchResults && searchResults.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-4">No matches. Try fewer words, or check the spelling.</p>
              )}
              {searchResults && searchResults.length > 0 && (
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                  {searchResults.map((r, i) => {
                    const inLibrary = findInLibrary(r);
                    return (
                      <li key={`${r.title}-${i}`} className="p-3 flex gap-3 items-start bg-white">
                        <div className="w-12 h-[4.5rem] bg-slate-100 rounded-md overflow-hidden shrink-0 flex items-center justify-center">
                          {r.cover ? <img src={r.cover} alt="" className="w-full h-full object-cover" loading="lazy" /> : <BookOpen className="w-4 h-4 text-slate-300" />}
                        </div>
                        <div className="min-w-0 flex-1 text-xs space-y-0.5">
                          <div className="font-bold text-slate-900">{r.title}</div>
                          <div className="text-slate-600">{r.authors?.join(', ') || 'Unknown author'}</div>
                          <div className="text-[11px] text-slate-400">
                            {[r.year, r.publisher, r.language && r.language !== 'English' ? r.language : null].filter(Boolean).join(' • ')}
                          </div>
                          <div className="pt-1.5 flex gap-1.5 flex-wrap">
                            {inLibrary ? (
                              <span className="text-[11px] font-semibold text-slate-500">
                                Already {inLibrary.owned === false ? 'on your wishlist' : 'on your shelf'}
                              </span>
                            ) : (
                              <button onClick={() => selectSearchResult(r)} className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-semibold rounded-lg">
                                Choose
                              </button>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="text-[11px] text-slate-400 text-center">
                Can't find it? <button onClick={() => { close(); onManualAdd({ title: searchTitle, author: searchAuthor }); }} className="underline font-semibold">Enter the details yourself</button>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
