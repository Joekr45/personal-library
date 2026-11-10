import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  BookOpen,
  Search,
  ScanBarcode,
  Library,
  BookmarkCheck,
  Clock,
  Heart,
  Layers,
  Users,
  Grid3X3,
  List,
  Plus,
  X,
  CheckCircle2,
  AlertTriangle,
  Globe2,
  ChevronRight,
  ChevronLeft,
  CameraOff,
  RefreshCw,
  BookMarked,
  LogOut,
  User,
  Compass,
  ArrowRight,
  Trash2,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ExternalLink
} from 'lucide-react';

// Fallback background palettes when an image is loading or unavailable
const COVER_THEMES = [
  { bg: 'from-amber-900 via-stone-900 to-black', accent: 'border-amber-400/40 text-amber-200', tag: 'bg-amber-500/20 text-amber-300' },
  { bg: 'from-slate-900 via-blue-950 to-black', accent: 'border-blue-400/40 text-blue-200', tag: 'bg-blue-500/20 text-blue-300' },
  { bg: 'from-emerald-950 via-teal-950 to-black', accent: 'border-emerald-400/40 text-emerald-200', tag: 'bg-emerald-500/20 text-emerald-300' },
  { bg: 'from-rose-950 via-red-950 to-stone-950', accent: 'border-rose-400/40 text-rose-200', tag: 'bg-rose-500/20 text-rose-300' },
  { bg: 'from-indigo-950 via-purple-950 to-neutral-950', accent: 'border-purple-400/40 text-purple-200', tag: 'bg-purple-500/20 text-purple-300' },
  { bg: 'from-cyan-950 via-sky-950 to-black', accent: 'border-cyan-400/40 text-cyan-200', tag: 'bg-cyan-500/20 text-cyan-300' }
];

const INITIAL_USERS = [
  {
    id: 'usr-1',
    email: 'admin@library.local',
    password: 'password123',
    displayName: 'Head Librarian',
    role: 'Owner',
    color: 'from-orange-500 to-amber-500'
  }
];

export default function App() {
// Authentication State
  const [users, setUsers] = useState(INITIAL_USERS);

  useEffect(() => {
    fetch('/api/users')
      .then(res => res.json())
      .then(serverUsers => {
        if (Array.isArray(serverUsers) && serverUsers.length > 0) {
          setUsers(serverUsers);
        }
      })
      .catch(err => console.warn('Could not sync users from server:', err));
  }, []);

  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('personal_library_current_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [userLibraries, setUserLibraries] = useState(() => {
    const saved = localStorage.getItem('personal_library_data');
    return saved ? JSON.parse(saved) : { 'usr-1': [] };
  });

  // Auth Screen Form State
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');

  // Persist auth and library data to localStorage
  useEffect(() => {
    localStorage.setItem('personal_library_users', JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('personal_library_current_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('personal_library_current_user');
    }
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('personal_library_data', JSON.stringify(userLibraries));
  }, [userLibraries]);

  const books = currentUser ? userLibraries[currentUser.id] || [] : [];
  const setBooksForCurrent = (updater) => {
    if (!currentUser) return;
    setUserLibraries(prev => ({
      ...prev,
      [currentUser.id]: typeof updater === 'function' ? updater(prev[currentUser.id] || []) : updater
    }));
  };

  // View state
  const [activeSection, setActiveSection] = useState('all');
  const [selectedAuthor, setSelectedAuthor] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 36;

  // Universal Global Author Search state
  const [globalAuthorQuery, setGlobalAuthorQuery] = useState('');
  const [viewingGlobalAuthor, setViewingGlobalAuthor] = useState(null);
  const [isSearchingAuthor, setIsSearchingAuthor] = useState(false);
  const [authorSearchError, setAuthorSearchError] = useState(null);

  // Modals & Scanner
  const [selectedBook, setSelectedBook] = useState(null);
  const [activeEditionIndex, setActiveEditionIndex] = useState(0);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [scanMode, setScanMode] = useState('camera');
  const [scannedIsbnInput, setScannedIsbnInput] = useState('');
  const [isLookingUpIsbn, setIsLookingUpIsbn] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [duplicateAlert, setDuplicateAlert] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [scanSuccessFeedback, setScanSuccessFeedback] = useState(false);

  // Manual Add Form Modal
  const [isManualAddOpen, setIsManualAddOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualAuthor, setManualAuthor] = useState('');
  const [manualSeries, setManualSeries] = useState('');
  const [manualSeriesNum, setManualSeriesNum] = useState('');
  const [manualIsbn, setManualIsbn] = useState('');
  const [manualFormat, setManualFormat] = useState('Hardcover');
  const [manualShelf, setManualShelf] = useState('Main Bookshelf');

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const barcodeDetectorRef = useRef(null);

  // Initialize Barcode Detector or load fallback ZXing script
  useEffect(() => {
    if ('BarcodeDetector' in window) {
      try {
        barcodeDetectorRef.current = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128']
        });
      } catch (e) {
        console.warn('BarcodeDetector format error:', e);
      }
    } else {
      if (!document.getElementById('zxing-script')) {
        const script = document.createElement('script');
        script.id = 'zxing-script';
        script.src = 'https://unpkg.com/@zxing/library@latest/umd/index.min.js';
        script.async = true;
        document.body.appendChild(script);
      }
    }
  }, []);

  // Beep sound on successful barcode lock
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
    } catch (e) {
      // AudioContext muted or blocked
    }
  };

  // Auth Handlers
  const handleAuthSubmit = (e) => {
    e.preventDefault();
    setAuthError('');

    const cleanEmail = authEmail.trim().toLowerCase();
    const cleanPassword = authPassword.trim();

    if (!cleanEmail || !cleanPassword) {
      setAuthError('Please fill out all required fields.');
      return;
    }

    if (authMode === 'login') {
      const match = users.find(u => u.email.toLowerCase() === cleanEmail && u.password === cleanPassword);
      if (!match) {
        setAuthError('Invalid email address or password. Try again or register.');
        return;
      }
      setCurrentUser(match);
      setAuthEmail('');
      setAuthPassword('');
    } else {
      const exists = users.some(u => u.email.toLowerCase() === cleanEmail);
      if (exists) {
        setAuthError('An account with this email address already exists.');
        return;
      }
      if (cleanPassword.length < 6) {
        setAuthError('Password must be at least 6 characters long.');
        return;
      }

      const newId = 'usr-' + Date.now();
      const newUser = {
        id: newId,
        email: cleanEmail,
        password: cleanPassword,
        displayName: authDisplayName.trim() || cleanEmail.split('@')[0],
        role: 'Member',
        color: ['from-blue-600 to-indigo-600', 'from-emerald-600 to-teal-600', 'from-purple-600 to-pink-600', 'from-rose-600 to-orange-600'][users.length % 4]
      };

      setUsers(prev => [...prev, newUser]);
      fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser)
    }).catch(err => console.error('Failed to sync registration to server:', err));
      setUserLibraries(prev => ({ ...prev, [newId]: [] }));
      setCurrentUser(newUser);
      setAuthEmail('');
      setAuthPassword('');
      setAuthDisplayName('');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setSelectedBook(null);
    setIsScanModalOpen(false);
    setIsManualAddOpen(false);
  };

  // Real-time lookup for ISBN
  const handleLookupIsbn = async (rawIsbn) => {
    const raw = (rawIsbn || scannedIsbnInput).trim().replace(/[^0-9X]/gi, '');
    if (!raw) return;

    const existing = books.find(b =>
      b.editions.some(e => e.isbn.replace(/[^0-9X]/gi, '') === raw)
    );
    if (existing) {
      setDuplicateAlert({
        book: existing,
        message: `You already own this book: "${existing.workTitle}" by ${existing.author} on shelf "${existing.shelfLocation}".`
      });
      setScanResult(null);
      return;
    }

    setDuplicateAlert(null);
    setIsLookingUpIsbn(true);
try {
 const cleanIsbn = raw.replace(/[^0-9X]/gi, '');
    
    // 1. Try Google Books
    const gRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`).catch(() => null);
    if (gRes && gRes.ok) {
      const gData = await gRes.json();
      if (gData.items && gData.items.length > 0) {
        const info = gData.items[0].volumeInfo;
        const authorName = info.authors ? info.authors.join(', ') : '';
        if (authorName) {
          setScanResult({
            workTitle: info.title || 'Untitled Book',
            author: authorName,
            series: null,
            seriesNumber: null,
            coverUrl: info.imageLinks?.thumbnail || `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg`,
            edition: {
              title: info.title || 'Untitled Book',
              language: 'English',
              format: 'Physical Print',
              isbn: cleanIsbn,
              published: info.publishedDate || 'Catalog Print',
              publisher: info.publisher || 'Publisher'
            }
          });
          return;
        }
      }
    }

    // 2. Open Library fallback (with full author names)
    const olRes = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`).catch(() => null);
    if (olRes && olRes.ok) {
      const olData = await olRes.json();
      const bookKey = `ISBN:${cleanIsbn}`;
      if (olData[bookKey]) {
        const book = olData[bookKey];
        const authorName = book.authors ? book.authors.map(a => a.name).join(', ') : '';
        setScanResult({
          workTitle: book.title || 'Untitled Book',
          author: authorName || 'Unknown Author',
          series: null,
          seriesNumber: null,
          coverUrl: book.cover?.large || book.cover?.medium || `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg`,
          edition: {
            title: book.title || 'Untitled Book',
            language: 'English',
            format: 'Physical Print',
            isbn: cleanIsbn,
            published: book.publish_date || 'Catalog Print',
            publisher: book.publishers ? book.publishers.map(p => p.name).join(', ') : 'Publisher'
          }
        });
        return;
      }
    }

      setScanResult({
        workTitle: `Book (ISBN: ${raw})`,
        author: 'Please enter author',
        series: null,
        seriesNumber: null,
        coverUrl: `https://covers.openlibrary.org/b/isbn/${raw}-L.jpg`,
        edition: {
          title: `Book (ISBN: ${raw})`,
          language: 'English',
          format: 'Physical Print',
          isbn: raw,
          published: 'Catalog Print',
          publisher: 'Publisher'
        }
      });
    } catch (err) {
      console.warn('Network lookup caught safely:', err);
    } finally {
      setIsLookingUpIsbn(false);
    }
  };

  // Global Author Search
  const handleLiveGlobalAuthorSearch = async (searchTerm) => {
    const query = (searchTerm || globalAuthorQuery).trim();
    if (!query) return;

    setIsSearchingAuthor(true);
    setAuthorSearchError(null);

    try {
      const cleanQ = encodeURIComponent(query);
      const res = await fetch(`https://openlibrary.org/search.json?q=${cleanQ}&mode=everything&limit=25`, {
        mode: 'cors'
      }).catch(() => null);

      if (!res || !res.ok) {
        throw new Error('Network timeout');
      }

      const data = await res.json();
      if (data.docs && data.docs.length > 0) {
        const formattedQueryName = query
          .split(' ')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ');

        const exactAuthorMatch = data.docs
          .flatMap(doc => doc.author_name || [])
          .find(a => a.toLowerCase().includes(query.toLowerCase()));

        const resolvedDisplayName = exactAuthorMatch || formattedQueryName;

        const foundBooks = data.docs
          .filter(doc => doc.title)
          .slice(0, 24)
          .map((doc, idx) => {
            const coverId = doc.cover_i;
            const isbn = doc.isbn ? doc.isbn[0] : null;
            const cover = coverId
              ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
              : isbn
              ? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`
              : null;

            const matchingAuthor = (doc.author_name || []).find(a =>
              a.toLowerCase().includes(query.toLowerCase())
            ) || doc.author_name?.[0] || resolvedDisplayName;

            return {
              id: doc.key || `ol-${idx}-${Date.now()}`,
              title: doc.title,
              author: matchingAuthor,
              publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : 'Unknown',
              description: 'Catalog bibliography entry.',
              coverUrl: cover,
              isbn: isbn || 'Pending Scan',
              category: (doc.subject && doc.subject[0]) || 'Fiction'
            };
          });

        setViewingGlobalAuthor({
          name: resolvedDisplayName,
          bio: `Catalog bibliography for ${resolvedDisplayName}.`,
          books: foundBooks
        });
        return;
      }

      setAuthorSearchError(`No catalog records found matching "${query}". Check spelling or try a different name.`);
    } catch (err) {
      console.warn('Author query fallback active:', err);
      setAuthorSearchError(`Connection timeout or rate limit from catalog.`);
    } finally {
      setIsSearchingAuthor(false);
    }
  };

  const libraryAuthors = useMemo(() => {
    const authorMap = {};
    books.forEach(b => {
      if (!authorMap[b.author]) {
        authorMap[b.author] = { name: b.author, count: 0 };
      }
      authorMap[b.author].count++;
    });
    return Object.values(authorMap).sort((a, b) => b.count - a.count);
  }, [books]);

  const counts = useMemo(() => {
    return {
      all: books.filter(b => b.owned).length,
      reading: books.filter(b => b.readingStatus === 'Reading' && b.owned).length,
      unread: books.filter(b => b.readingStatus === 'Unread' && b.owned).length,
      completed: books.filter(b => b.readingStatus === 'Completed' && b.owned).length,
      wishlist: books.filter(b => b.isWishlist || (!b.owned && b.isWishlist)).length,
      authors: libraryAuthors.length,
      series: Array.from(new Set(books.map(b => b.series).filter(Boolean))).length
    };
  }, [books, libraryAuthors]);

  const filteredBooks = useMemo(() => {
    return books.filter(b => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        b.workTitle.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        (b.series && b.series.toLowerCase().includes(q)) ||
        b.editions.some(e => e.isbn.includes(q));

      if (!matchesSearch) return false;

      if (activeSection === 'all') return b.owned;
      if (activeSection === 'reading') return b.readingStatus === 'Reading' && b.owned;
      if (activeSection === 'unread') return b.readingStatus === 'Unread' && b.owned;
      if (activeSection === 'completed') return b.readingStatus === 'Completed' && b.owned;
      if (activeSection === 'wishlist') return b.isWishlist || !b.owned;
      if (activeSection === 'authors' && selectedAuthor) return b.author === selectedAuthor;
      return true;
    });
  }, [books, activeSection, searchQuery, selectedAuthor]);

  const totalPages = Math.ceil(filteredBooks.length / ITEMS_PER_PAGE);
  const paginatedBooks = useMemo(() => {
    if (activeSection === 'authors' || activeSection === 'series') return filteredBooks;
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredBooks.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredBooks, currentPage, activeSection]);

  // Continuous Camera Scanning Loop
  const startScanningLoop = () => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    scanIntervalRef.current = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || isLookingUpIsbn) return;

      try {
        if (barcodeDetectorRef.current) {
          const barcodes = await barcodeDetectorRef.current.detect(video);
          if (barcodes && barcodes.length > 0) {
            const rawVal = barcodes[0].rawValue.trim();
            if (rawVal) {
              clearInterval(scanIntervalRef.current);
              playBeep();
              setScanSuccessFeedback(true);
              setTimeout(() => setScanSuccessFeedback(false), 1500);
              setScannedIsbnInput(rawVal);
              handleLookupIsbn(rawVal);
              return;
            }
          }
        } else if (window.ZXing) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          if (!window._zxingReader) {
            window._zxingReader = new window.ZXing.BrowserMultiFormatReader();
          }

          try {
            const result = await window._zxingReader.decodeFromImageElement(canvas);
            if (result && result.getText()) {
              const text = result.getText().trim();
              clearInterval(scanIntervalRef.current);
              playBeep();
              setScanSuccessFeedback(true);
              setTimeout(() => setScanSuccessFeedback(false), 1500);
              setScannedIsbnInput(text);
              handleLookupIsbn(text);
              return;
            }
          } catch (zxErr) {
            // Normal scan frame miss
          }
        }
      } catch (err) {}
    }, 250);
  };

  const stopCameraStream = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const startCameraStream = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access not supported on this browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play().catch(() => {});
      }
      setIsCameraActive(true);
      startScanningLoop();
    } catch (err) {
      setCameraError('Camera standby or permission needed. You can also enter the ISBN manually.');
      setIsCameraActive(false);
    }
  };

  useEffect(() => {
    if (isScanModalOpen && scanMode === 'camera') {
      startCameraStream();
    } else {
      stopCameraStream();
    }
    return () => stopCameraStream();
  }, [isScanModalOpen, scanMode]);

  const toggleWishlist = (bookId, e) => {
    e?.stopPropagation();
    setBooksForCurrent(prev =>
      prev.map(b => (b.id === bookId ? { ...b, isWishlist: !b.isWishlist } : b))
    );
  };

  const deleteBook = (bookId, e) => {
    e?.stopPropagation();
    if (confirm('Are you sure you want to remove this book from your shelves?')) {
      setBooksForCurrent(prev => prev.filter(b => b.id !== bookId));
      if (selectedBook?.id === bookId) setSelectedBook(null);
    }
  };

  const handleAddScannedBook = () => {
    if (!scanResult) return;
    const newBook = {
      id: 'book-' + Date.now(),
      workTitle: scanResult.workTitle,
      author: scanResult.author,
      series: scanResult.series,
      seriesNumber: scanResult.seriesNumber,
      owned: true,
      readingStatus: 'Unread',
      shelfLocation: 'Living Room Shelf',
      customCoverUrl: scanResult.coverUrl,
      theme: COVER_THEMES[Math.floor(Math.random() * COVER_THEMES.length)],
      editions: [scanResult.edition]
    };
    setBooksForCurrent(prev => [newBook, ...prev]);
    stopCameraStream();
    setIsScanModalOpen(false);
    setScanResult(null);
    setScannedIsbnInput('');
    setDuplicateAlert(null);
  };

  const handleManualAddSubmit = (e) => {
    e.preventDefault();
    if (!manualTitle.trim() || !manualAuthor.trim()) return;

    const cleanIsbn = manualIsbn.trim().replace(/[^0-9X]/gi, '') || 'Pending Scan';
    const cover = cleanIsbn !== 'Pending Scan' ? `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg` : null;

    const newBook = {
      id: 'book-' + Date.now(),
      workTitle: manualTitle.trim(),
      author: manualAuthor.trim(),
      series: manualSeries.trim() || null,
      seriesNumber: manualSeriesNum ? parseInt(manualSeriesNum, 10) : null,
      owned: true,
      readingStatus: 'Unread',
      shelfLocation: manualShelf.trim() || 'Living Room Shelf',
      customCoverUrl: cover,
      theme: COVER_THEMES[Math.floor(Math.random() * COVER_THEMES.length)],
      editions: [{
        id: `ed-${Date.now()}`,
        title: manualTitle.trim(),
        language: 'English',
        format: manualFormat,
        isbn: cleanIsbn,
        published: 'Physical Edition',
        publisher: 'Publisher'
      }]
    };

    setBooksForCurrent(prev => [newBook, ...prev]);
    setManualTitle('');
    setManualAuthor('');
    setManualSeries('');
    setManualSeriesNum('');
    setManualIsbn('');
    setIsManualAddOpen(false);
  };

  const navigateToAuthor = (authorName, e) => {
    e?.stopPropagation();
    setSelectedAuthor(authorName);
    setViewingGlobalAuthor(null);
    setActiveSection('authors');
    setCurrentPage(1);
    if (selectedBook) setSelectedBook(null);
  };

  // GATEWAY: MANDATORY LOGIN / REGISTRATION SCREEN
  if (!currentUser) {
    return (
      <div className="min-h-screen w-full bg-[#0f1117] text-white flex flex-col justify-center items-center p-4 relative overflow-hidden select-none">
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-orange-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-amber-600/20 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-md w-full bg-slate-900/80 backdrop-blur-2xl border border-slate-800 rounded-3xl p-8 shadow-2xl relative z-10 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-orange-500 via-amber-500 to-amber-400 flex items-center justify-center text-white shadow-lg shadow-orange-500/30">
              <BookOpen className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">Personal Library</h1>
            <p className="text-xs text-slate-400">
              {authMode === 'login' ? 'Sign in with your email to access your personal shelves' : 'Create a family member profile with your email'}
            </p>
          </div>

          <div className="flex bg-slate-800/80 p-1 rounded-2xl border border-slate-700/60 text-xs font-semibold">
            <button
              type="button"
              onClick={() => { setAuthMode('login'); setAuthError(''); }}
              className={`flex-1 py-2 rounded-xl transition-all ${
                authMode === 'login' ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode('register'); setAuthError(''); }}
              className={`flex-1 py-2 rounded-xl transition-all ${
                authMode === 'register' ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authMode === 'register' && (
              <div>
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                  Full Name / Display Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={authDisplayName}
                    onChange={(e) => setAuthDisplayName(e.target.value)}
                    placeholder="e.g. Alex, Mom, John"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-800/90 text-xs text-white placeholder-slate-500 rounded-xl border border-slate-700 focus:outline-none focus:border-orange-500 transition-colors"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="e.g. name@example.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-800/90 text-xs text-white placeholder-slate-500 rounded-xl border border-slate-700 focus:outline-none focus:border-orange-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-800/90 text-xs text-white placeholder-slate-500 rounded-xl border border-slate-700 focus:outline-none focus:border-orange-500 transition-colors font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {authError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 active:scale-[0.99] text-white text-xs font-bold rounded-xl shadow-lg shadow-orange-500/25 transition-all mt-2"
            >
              {authMode === 'login' ? 'Sign In to My Library' : 'Create My Account & Enter'}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-800/80 text-center">
            <p className="text-[11px] text-slate-500">
              First time running? Use default owner: <code className="text-orange-400">admin@library.local</code> / <code className="text-orange-400">password123</code> or register any email above.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-[#fbfbfd] text-slate-900 font-sans antialiased overflow-hidden select-none">
      {/* SIDEBAR */}
      <aside className="w-64 flex-shrink-0 bg-[#f4f4f7]/95 backdrop-blur-2xl border-r border-slate-200/80 flex flex-col justify-between p-4 z-20">
        <div className="space-y-5 overflow-y-auto pr-1">
          <div className="flex items-center gap-3 px-1 pt-1">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-orange-500 via-amber-500 to-amber-400 flex items-center justify-center text-white shadow-md shadow-orange-500/20">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-slate-900">Personal Library</h1>
              <p className="text-[11px] text-slate-500">Apple Books Edition</p>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${currentUser.color} flex items-center justify-center text-white text-xs font-bold shadow-xs flex-shrink-0`}>
                  {currentUser.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-800 truncate">
                    {currentUser.displayName}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate font-mono">
                    {currentUser.email}
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:text-red-600 bg-slate-50 hover:bg-red-50 rounded-xl transition-colors border border-slate-200/60"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>

          <div className="space-y-1">
            <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase px-2 mb-1">My Books</p>

            <button
              onClick={() => { setActiveSection('all'); setSelectedAuthor(null); setCurrentPage(1); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                activeSection === 'all'
                  ? 'bg-orange-500 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Library className="w-4 h-4" />
                <span>All Books</span>
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${activeSection === 'all' ? 'bg-orange-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {counts.all}
              </span>
            </button>

            <button
              onClick={() => { setActiveSection('reading'); setSelectedAuthor(null); setCurrentPage(1); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                activeSection === 'reading'
                  ? 'bg-orange-500 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4" />
                <span>Reading Now</span>
              </div>
              <span className={`text-[11px] font-normal ${activeSection === 'reading' ? 'text-orange-100' : 'text-slate-400'}`}>
                {counts.reading}
              </span>
            </button>

            <button
              onClick={() => { setActiveSection('unread'); setSelectedAuthor(null); setCurrentPage(1); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                activeSection === 'unread'
                  ? 'bg-orange-500 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <BookMarked className="w-4 h-4" />
                <span>Want to Read</span>
              </div>
              <span className={`text-[11px] font-normal ${activeSection === 'unread' ? 'text-orange-100' : 'text-slate-400'}`}>
                {counts.unread}
              </span>
            </button>

            <button
              onClick={() => { setActiveSection('completed'); setSelectedAuthor(null); setCurrentPage(1); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                activeSection === 'completed'
                  ? 'bg-orange-500 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <BookmarkCheck className="w-4 h-4" />
                <span>Finished</span>
              </div>
              <span className={`text-[11px] font-normal ${activeSection === 'completed' ? 'text-orange-100' : 'text-slate-400'}`}>
                {counts.completed}
              </span>
            </button>

            <button
              onClick={() => { setActiveSection('wishlist'); setSelectedAuthor(null); setCurrentPage(1); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                activeSection === 'wishlist'
                  ? 'bg-orange-500 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Heart className="w-4 h-4" />
                <span>Missing / Wishlist</span>
              </div>
              <span className={`text-[11px] font-normal ${activeSection === 'wishlist' ? 'text-orange-100' : 'text-slate-400'}`}>
                {counts.wishlist}
              </span>
            </button>
          </div>

          <div className="space-y-1">
            <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase px-2 mb-1">Explore</p>

            <button
              onClick={() => {
                setActiveSection('authors');
                setSelectedAuthor(null);
                setViewingGlobalAuthor(null);
                setCurrentPage(1);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                activeSection === 'authors'
                  ? 'bg-orange-500 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4" />
                <span>Authors & Lookup</span>
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${activeSection === 'authors' ? 'bg-orange-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {counts.authors}
              </span>
            </button>

            <button
              onClick={() => { setActiveSection('series'); setSelectedAuthor(null); setCurrentPage(1); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                activeSection === 'series'
                  ? 'bg-orange-500 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Layers className="w-4 h-4" />
                <span>Series Collections</span>
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${activeSection === 'series' ? 'bg-orange-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {counts.series}
              </span>
            </button>
          </div>
        </div>

        <div className="bg-white/80 border border-slate-200/80 p-3 rounded-2xl shadow-2xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-slate-800">Unraid Storage</span>
            <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {books.length} Books
            </span>
          </div>
          <p className="text-[10px] text-slate-500">
            Account verified for {currentUser.displayName}.
          </p>
        </div>
      </aside>

      {/* MAIN WORKSPACE */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#fbfbfd] overflow-hidden">
        <header className="h-16 border-b border-slate-200/80 bg-[#fbfbfd]/80 backdrop-blur-md px-8 flex items-center justify-between gap-4 z-10 flex-shrink-0">
          <div className="relative w-96">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              placeholder="Search your library by title, author, series, or ISBN..."
              className="w-full pl-9 pr-8 py-2 bg-slate-100 hover:bg-slate-200/50 focus:bg-white text-xs text-slate-900 placeholder-slate-400 rounded-xl border border-transparent focus:border-slate-300 focus:outline-none transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setCurrentPage(1); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === 'grid' ? 'bg-white shadow-2xs text-slate-900' : 'text-slate-400 hover:text-slate-700'
                }`}
                title="Apple Books Grid"
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === 'list' ? 'bg-white shadow-2xs text-slate-900' : 'text-slate-400 hover:text-slate-700'
                }`}
                title="Table Spreadsheet View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => setIsManualAddOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold shadow-2xs transition-all"
            >
              <Plus className="w-4 h-4 text-orange-500" />
              <span>Add Manually</span>
            </button>

            <button
              onClick={() => {
                setDuplicateAlert(null);
                setScanResult(null);
                setIsScanModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white rounded-xl text-xs font-semibold shadow-xs transition-all"
            >
              <ScanBarcode className="w-4 h-4" />
              <span>Scan Barcode</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          {activeSection === 'authors' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-transparent border border-orange-200/80 p-6 rounded-3xl space-y-4">
                <div className="flex items-center gap-2 text-slate-900">
                  <Compass className="w-5 h-5 text-orange-600" />
                  <h2 className="text-base font-bold">Universal Global Author Search</h2>
                </div>
                <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
                  Search <strong>any author in the world</strong> to pull their bibliography, real covers, and instantly add titles to your shelf with one click.
                </p>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleLiveGlobalAuthorSearch();
                  }}
                  className="flex gap-2 max-w-2xl"
                >
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={globalAuthorQuery}
                      onChange={(e) => setGlobalAuthorQuery(e.target.value)}
                      placeholder="Type any author name and press Enter..."
                      className="w-full pl-10 pr-4 py-2.5 bg-white text-xs text-slate-900 placeholder-slate-400 rounded-xl border border-slate-200 focus:outline-none focus:border-orange-500 shadow-xs"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSearchingAuthor || !globalAuthorQuery.trim()}
                    className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 whitespace-nowrap"
                  >
                    {isSearchingAuthor ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Searching...</span>
                      </>
                    ) : (
                      <>
                        <Search className="w-3.5 h-3.5" />
                        <span>Search Catalog</span>
                      </>
                    )}
                  </button>
                </form>

                {authorSearchError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>{authorSearchError}</span>
                  </div>
                )}
              </div>

              {viewingGlobalAuthor && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs uppercase font-bold tracking-wider text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                          Catalog Search Results
                        </span>
                        <h3 className="text-xl font-bold text-slate-900">{viewingGlobalAuthor.name}</h3>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{viewingGlobalAuthor.bio}</p>
                    </div>
                    <button
                      onClick={() => setViewingGlobalAuthor(null)}
                      className="text-xs text-slate-500 hover:text-slate-800 font-semibold px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50"
                    >
                      Close View ✕
                    </button>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Published Works ({viewingGlobalAuthor.books?.length || 0} Retrieved)
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {viewingGlobalAuthor.books?.map((item) => (
                        <div key={item.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex gap-3 items-center">
                          <div className="w-14 h-20 bg-slate-200 rounded-md overflow-hidden flex-shrink-0 shadow-2xs">
                            {item.coverUrl ? (
                              <img src={item.coverUrl} alt={item.title} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-400 text-[10px] text-center p-1">No Cover</div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-slate-900 truncate" title={item.title}>
                              {item.title}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {item.publishedDate} • {item.category}
                            </div>
                            <button
                              onClick={() => {
                                const newBook = {
                                  id: 'book-' + Date.now() + '-' + Math.random(),
                                  workTitle: item.title,
                                  author: item.author,
                                  series: null,
                                  seriesNumber: null,
                                  owned: true,
                                  readingStatus: 'Unread',
                                  shelfLocation: 'Living Room Shelf',
                                  customCoverUrl: item.coverUrl,
                                  theme: COVER_THEMES[Math.floor(Math.random() * COVER_THEMES.length)],
                                  editions: [{
                                    id: `ed-${Date.now()}`,
                                    title: item.title,
                                    language: 'English',
                                    format: 'Paperback',
                                    isbn: item.isbn || 'Pending Scan',
                                    published: item.publishedDate,
                                    publisher: 'Publisher'
                                  }]
                                };
                                setBooksForCurrent(prev => [newBook, ...prev]);
                                alert(`Added "${item.title}" to your shelf!`);
                              }}
                              className="mt-2 px-2.5 py-1 bg-orange-500 hover:bg-orange-600 text-white text-[10px] font-semibold rounded-lg shadow-2xs"
                            >
                              + Add to My Shelf
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                    Authors Currently On Your Shelves ({libraryAuthors.length})
                  </h3>
                </div>

                {libraryAuthors.length === 0 ? (
                  <div className="p-8 text-center bg-white border border-slate-200 rounded-2xl">
                    <p className="text-xs text-slate-500">
                      No authors in your personal library yet. Use the barcode scanner or global search above to add your first book!
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {libraryAuthors.map((auth) => (
                      <div
                        key={auth.name}
                        onClick={(e) => navigateToAuthor(auth.name, e)}
                        className={`p-3 rounded-2xl border text-left cursor-pointer transition-all flex flex-col justify-between h-24 ${
                          selectedAuthor === auth.name
                            ? 'bg-orange-50/80 border-orange-400 shadow-xs'
                            : 'bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-2xs'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-700">
                            {auth.name.charAt(0)}
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {auth.count} {auth.count === 1 ? 'book' : 'books'}
                          </span>
                        </div>
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {auth.name}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedAuthor && (
                <div className="mt-8 pt-6 border-t border-slate-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">{selectedAuthor}</h3>
                      <p className="text-xs text-slate-500">
                        Showing all titles in your collection by this author.
                      </p>
                    </div>
                    <button
                      onClick={() => { setActiveSection('all'); setSelectedAuthor(null); setCurrentPage(1); }}
                      className="text-xs text-orange-600 font-semibold hover:underline"
                    >
                      View All Books →
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
                    {books.filter(b => b.author.toLowerCase() === selectedAuthor.toLowerCase()).map(book => (
                      <AppleBookCard
                        key={book.id}
                        book={book}
                        onClick={() => { setSelectedBook(book); setActiveEditionIndex(0); }}
                        onAuthorClick={(e) => navigateToAuthor(book.author, e)}
                        onToggleWishlist={(e) => toggleWishlist(book.id, e)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeSection === 'series' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900">Series Collections</h2>
                <p className="text-xs text-slate-500">
                  Organized by chronological reading sequence from your bookshelf.
                </p>
              </div>

              {counts.series === 0 ? (
                <div className="p-8 text-center bg-white border border-slate-200 rounded-2xl">
                  <p className="text-xs text-slate-500">
                    No series added yet. When you scan or add a book with a series name, it will group here automatically.
                  </p>
                </div>
              ) : (
                Array.from(new Set(books.map(b => b.series).filter(Boolean))).map(seriesName => {
                  const sBooks = books
                    .filter(b => b.series === seriesName)
                    .sort((a, b) => (a.seriesNumber || 99) - (b.seriesNumber || 99));

                  return (
                    <div key={seriesName} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <div>
                          <h3 className="text-base font-bold text-slate-900">{seriesName}</h3>
                          <p className="text-xs text-slate-500">
                            by{' '}
                            <button
                              onClick={(e) => navigateToAuthor(sBooks[0]?.author, e)}
                              className="font-semibold text-slate-800 hover:text-orange-600 underline"
                            >
                              {sBooks[0]?.author || 'Unknown'}
                            </button>{' '}
                            • {sBooks.length} titles
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
                        {sBooks.map(book => (
                          <AppleBookCard
                            key={book.id}
                            book={book}
                            onClick={() => { setSelectedBook(book); setActiveEditionIndex(0); }}
                            onAuthorClick={(e) => navigateToAuthor(book.author, e)}
                            onToggleWishlist={(e) => toggleWishlist(book.id, e)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeSection !== 'authors' && activeSection !== 'series' && (
            <div className="space-y-6">
              <div className="flex items-baseline justify-between">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-slate-900">
                    {activeSection === 'all' && `All Books (${filteredBooks.length})`}
                    {activeSection === 'reading' && 'Currently Reading'}
                    {activeSection === 'unread' && `Want to Read (${filteredBooks.length})`}
                    {activeSection === 'completed' && 'Finished Books'}
                    {activeSection === 'wishlist' && 'Missing / Wishlist'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {filteredBooks.length === 0
                      ? `Your shelves are clean and empty, ${currentUser.displayName}. Ready to scan or add your first book.`
                      : `Showing page ${currentPage} of ${totalPages || 1} • ${filteredBooks.length} total books`}
                  </p>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                      className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 shadow-2xs"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-semibold text-slate-700 px-1">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                      className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 shadow-2xs"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {filteredBooks.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-center space-y-4 bg-white border border-dashed border-slate-300 rounded-3xl p-8">
                  <div className="w-16 h-16 rounded-2xl bg-orange-50 text-orange-500 flex items-center justify-center shadow-xs">
                    <ScanBarcode className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-slate-800">Your Shelf is Empty</h3>
                    <p className="text-xs text-slate-500 max-w-sm">
                      Scan the barcode of a book in your hands or use manual entry to add it to your collection.
                    </p>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setIsScanModalOpen(true)}
                      className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2"
                    >
                      <ScanBarcode className="w-4 h-4" />
                      <span>Scan Barcode</span>
                    </button>
                    <button
                      onClick={() => setIsManualAddOpen(true)}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Manual Entry</span>
                    </button>
                  </div>
                </div>
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                  {paginatedBooks.map(book => (
                    <AppleBookCard
                      key={book.id}
                      book={book}
                      onClick={() => { setSelectedBook(book); setActiveEditionIndex(0); }}
                      onAuthorClick={(e) => navigateToAuthor(book.author, e)}
                      onToggleWishlist={(e) => toggleWishlist(book.id, e)}
                    />
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
                      <tr>
                        <th className="py-3 px-4">Title & Series</th>
                        <th className="py-3 px-4">Author</th>
                        <th className="py-3 px-4">Reading Status</th>
                        <th className="py-3 px-4">ISBN</th>
                        <th className="py-3 px-4">Shelf Location</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedBooks.map(book => (
                        <tr
                          key={book.id}
                          onClick={() => { setSelectedBook(book); setActiveEditionIndex(0); }}
                          className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                        >
                          <td className="py-3 px-4 font-medium text-slate-900">
                            <div>{book.workTitle}</div>
                            {book.series && (
                              <div className="text-[11px] text-orange-600 font-medium">
                                {book.series} #{book.seriesNumber}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <button
                              onClick={(e) => navigateToAuthor(book.author, e)}
                              className="text-slate-600 hover:text-orange-600 hover:underline font-medium"
                            >
                              {book.author}
                            </button>
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                              {book.readingStatus}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-500">
                            {book.editions[0]?.isbn || 'N/A'}
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {book.shelfLocation || 'Living Room Shelf'}
                          </td>
                          <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={(e) => deleteBook(book.id, e)}
                              className="text-[11px] font-medium text-slate-400 hover:text-red-600 p-1"
                              title="Delete Book"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* MODAL: BOOK DETAIL & EDITION SWITCHER */}
      {selectedBook && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Book Details & Edition
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => deleteBook(selectedBook.id, e)}
                  className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                  title="Remove Book"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setSelectedBook(null)}
                  className="w-8 h-8 rounded-full bg-slate-200/60 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              <div className="flex gap-6 items-start">
                <div className="w-40 flex-shrink-0">
                  <AppleBookCover
                    book={selectedBook}
                    height="h-56"
                  />
                </div>

                <div className="flex-1 space-y-3">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 leading-tight">{selectedBook.workTitle}</h3>
                    <button
                      onClick={(e) => navigateToAuthor(selectedBook.author, e)}
                      className="text-sm font-semibold text-orange-600 hover:underline mt-0.5 flex items-center gap-1"
                    >
                      <span>{selectedBook.author}</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>

                  {selectedBook.series && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-800 text-xs font-bold">
                      <span>{selectedBook.series}</span>
                      <span>#{selectedBook.seriesNumber}</span>
                    </div>
                  )}

                  <div className="pt-2">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                      Reading Status for {currentUser.displayName}
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {['Unread', 'Reading', 'Completed'].map(status => (
                        <button
                          key={status}
                          onClick={() => {
                            setBooksForCurrent(prev =>
                              prev.map(b => (b.id === selectedBook.id ? { ...b, readingStatus: status } : b))
                            );
                            setSelectedBook(prev => ({ ...prev, readingStatus: status }));
                          }}
                          className={`py-2 text-xs rounded-xl font-semibold border transition-all ${
                            selectedBook.readingStatus === status
                              ? 'bg-orange-500 text-white border-orange-500 shadow-xs'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Globe2 className="w-4 h-4 text-orange-500" />
                    <span className="text-xs font-bold text-slate-800">Physical Edition & Shelf Data</span>
                  </div>
                  {selectedBook.editions[activeEditionIndex]?.isbn && selectedBook.editions[activeEditionIndex].isbn !== 'Pending Scan' && (
                    <a
                      href={`https://openlibrary.org/isbn/${selectedBook.editions[activeEditionIndex]?.isbn}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-orange-600 font-semibold hover:underline flex items-center gap-1"
                    >
                      <span>View on Open Library</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                {selectedBook.editions[activeEditionIndex] && (
                  <div className="grid grid-cols-2 gap-3 text-xs bg-white p-3 rounded-xl border border-slate-200/80">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">ISBN-13 Barcode</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-slate-800 font-semibold">
                          {selectedBook.editions[activeEditionIndex].isbn}
                        </span>
                        <button
                          onClick={() => {
                            const newIsbn = prompt('Enter exact ISBN (e.g. 9780446610032):', selectedBook.editions[activeEditionIndex].isbn === 'Pending Scan' ? '' : selectedBook.editions[activeEditionIndex].isbn);
                            if (newIsbn && newIsbn.trim()) {
                              const clean = newIsbn.trim().replace(/[^0-9X]/gi, '');
                              const newCoverUrl = `https://covers.openlibrary.org/b/isbn/${clean}-L.jpg`;
                              setBooksForCurrent(prev => prev.map(b => {
                                if (b.id === selectedBook.id) {
                                  const updatedEditions = [...b.editions];
                                  updatedEditions[activeEditionIndex] = { ...updatedEditions[activeEditionIndex], isbn: clean };
                                  return { ...b, editions: updatedEditions, customCoverUrl: newCoverUrl };
                                }
                                return b;
                              }));
                              setSelectedBook(prev => {
                                const updatedEditions = [...prev.editions];
                                updatedEditions[activeEditionIndex] = { ...updatedEditions[activeEditionIndex], isbn: clean };
                                return { ...prev, editions: updatedEditions, customCoverUrl: newCoverUrl };
                              });
                            }
                          }}
                          className="text-[10px] text-orange-600 hover:text-orange-700 font-medium underline"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Format</span>
                      <span className="text-slate-800 font-medium">{selectedBook.editions[activeEditionIndex].format}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Shelf Location</span>
                      <span className="text-slate-800 font-medium">{selectedBook.shelfLocation || 'Living Room Shelf'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Language</span>
                      <span className="text-slate-800 font-medium">{selectedBook.editions[activeEditionIndex].language}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MANUAL ADD FORM */}
      {isManualAddOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-orange-500" />
                <h3 className="text-sm font-bold text-slate-900">Add Book to Shelf</h3>
              </div>
              <button
                onClick={() => setIsManualAddOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-200/60 hover:bg-slate-200 flex items-center justify-center text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleManualAddSubmit} className="p-5 space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">Book Title *</label>
                <input
                  type="text"
                  required
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="e.g. 1st To Die"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">Author *</label>
                <input
                  type="text"
                  required
                  value={manualAuthor}
                  onChange={(e) => setManualAuthor(e.target.value)}
                  placeholder="e.g. James Patterson"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">Series Name</label>
                  <input
                    type="text"
                    value={manualSeries}
                    onChange={(e) => setManualSeries(e.target.value)}
                    placeholder="e.g. Women's Murder Club"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">Book # In Series</label>
                  <input
                    type="number"
                    value={manualSeriesNum}
                    onChange={(e) => setManualSeriesNum(e.target.value)}
                    placeholder="e.g. 1"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">ISBN-13 (Optional)</label>
                  <input
                    type="text"
                    value={manualIsbn}
                    onChange={(e) => setManualIsbn(e.target.value)}
                    placeholder="e.g. 9780446610032"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">Format</label>
                  <select
                    value={manualFormat}
                    onChange={(e) => setManualFormat(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 bg-white"
                  >
                    <option value="Hardcover">Hardcover</option>
                    <option value="Paperback">Paperback</option>
                    <option value="Mass Market Paperback">Mass Market Paperback</option>
                    <option value="Special Collector Edition">Collector's Edition</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">Shelf Location</label>
                <input
                  type="text"
                  value={manualShelf}
                  onChange={(e) => setManualShelf(e.target.value)}
                  placeholder="e.g. Living Room Shelf 2, Study"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-xl shadow-xs transition-all mt-4"
              >
                + Place On Shelf
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: LIVE CAMERA BARCODE SCANNER */}
      {isScanModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden flex flex-col max-h-[95vh]">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <ScanBarcode className="w-4 h-4 text-orange-500" />
                <h3 className="text-sm font-bold text-slate-900">ISBN Barcode Scanner</h3>
              </div>
              <button
                onClick={() => { stopCameraStream(); setIsScanModalOpen(false); }}
                className="w-7 h-7 rounded-full bg-slate-200/60 hover:bg-slate-200 flex items-center justify-center text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex bg-slate-100 p-1 border-b border-slate-200 text-xs">
              <button
                onClick={() => setScanMode('camera')}
                className={`flex-1 py-2 rounded-xl font-semibold transition-all ${
                  scanMode === 'camera' ? 'bg-white shadow-xs text-orange-600' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Live Camera
              </button>
              <button
                onClick={() => { stopCameraStream(); setScanMode('manual'); }}
                className={`flex-1 py-2 rounded-xl font-semibold transition-all ${
                  scanMode === 'manual' ? 'bg-white shadow-xs text-orange-600' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Manual ISBN
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {scanMode === 'camera' && (
                <div className="space-y-3">
                  <div className="relative aspect-video w-full bg-black rounded-2xl overflow-hidden flex items-center justify-center border border-slate-800">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      className={`w-full h-full object-cover ${isCameraActive ? 'block' : 'hidden'}`}
                    />
                    {!isCameraActive && (
                      <div className="p-6 text-center text-slate-400 space-y-2">
                        <CameraOff className="w-8 h-8 mx-auto opacity-50" />
                        <p className="text-xs font-medium text-slate-300">{cameraError || 'Camera initializing...'}</p>
                        <button
                          onClick={startCameraStream}
                          className="px-3 py-1 bg-slate-800 text-white rounded-lg text-xs font-medium"
                        >
                          Retry Camera
                        </button>
                      </div>
                    )}
                    {isCameraActive && (
                      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                        <div className={`w-64 h-32 border-2 rounded-xl transition-all duration-300 relative ${
                          scanSuccessFeedback
                            ? 'border-emerald-400 bg-emerald-500/20 shadow-[0_0_20px_rgba(52,211,153,0.8)]'
                            : 'border-orange-500 bg-orange-500/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]'
                        }`}>
                          <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-white" />
                          <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-white" />
                          <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-white" />
                          <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-white" />
                          <div className="w-full h-0.5 bg-red-500 animate-pulse mt-16 shadow-[0_0_8px_rgba(239,68,68,1)]" />
                        </div>
                        {scanSuccessFeedback && (
                          <div className="mt-3 px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded-full shadow-lg flex items-center gap-1.5 animate-bounce">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Barcode Locked!</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-center">
                    <p className="text-[11px] text-slate-500">
                      Center the barcode inside the box. It will automatically lock on and scan.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={scannedIsbnInput}
                    onChange={(e) => setScannedIsbnInput(e.target.value)}
                    placeholder="Type or paste ISBN (e.g. 9780446610032)..."
                    className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono focus:outline-none focus:border-orange-500"
                  />
                  <button
                    disabled={isLookingUpIsbn || !scannedIsbnInput.trim()}
                    onClick={() => handleLookupIsbn(scannedIsbnInput)}
                    className="px-4 py-2 bg-orange-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold hover:bg-orange-600 shadow-xs flex items-center gap-1.5"
                  >
                    {isLookingUpIsbn ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Finding...</span>
                      </>
                    ) : (
                      <span>Lookup ISBN</span>
                    )}
                  </button>
                </div>
              </div>

              {duplicateAlert && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-900">Duplicate Copy Detected</h4>
                    <p className="text-xs text-amber-800 mt-0.5">{duplicateAlert.message}</p>
                  </div>
                </div>
              )}

              {scanResult && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-800">Book Found</span>
                    <span className="text-[10px] font-mono text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                      ISBN: {scanResult.edition.isbn}
                    </span>
                  </div>

                  <div className="flex gap-4 items-center">
                    <div className="w-16 h-24 rounded-lg overflow-hidden border border-emerald-300 shadow-xs flex-shrink-0 bg-white">
                      {scanResult.coverUrl ? (
                        <img
                          src={scanResult.coverUrl}
                          alt={scanResult.workTitle}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400 text-[10px] text-center p-1">No Cover</div>
                      )}
                    </div>
                    <div className="text-xs min-w-0 flex-1">
                      <div className="font-bold text-slate-900 text-sm truncate">{scanResult.workTitle}</div>
                      <div className="text-slate-600">by {scanResult.author}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {scanResult.edition.published} • {scanResult.edition.format}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleAddScannedBook}
                    className="w-full py-2 bg-emerald-600 text-white font-semibold text-xs rounded-xl shadow-xs hover:bg-emerald-700 transition-colors"
                  >
                    + Place In My Library
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Apple Books Cover with Image Fallback
function AppleBookCover({ book, height = 'aspect-[2/3]' }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const coverUrl = book.customCoverUrl || (book.editions?.[0]?.isbn && book.editions[0].isbn !== 'Pending Scan' ? `https://covers.openlibrary.org/b/isbn/${book.editions[0].isbn}-M.jpg` : null);
  const theme = book.theme || COVER_THEMES[0];

  return (
    <div className={`relative w-full ${height} rounded-2xl overflow-hidden shadow-md group-hover:shadow-xl border border-black/10 bg-slate-900 transition-all duration-300 flex flex-col justify-between`}>
      {coverUrl && !imageError && (
        <img
          src={coverUrl}
          alt={book.workTitle}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
          className={`absolute inset-0 w-full h-full object-cover z-0 transition-opacity duration-300 ${
            imageLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          loading="lazy"
        />
      )}

      {(!imageLoaded || imageError || !coverUrl) && (
        <>
          <div className={`absolute inset-0 bg-gradient-to-br ${theme.bg} z-0`} />
          <div className="absolute inset-0 bg-radial-at-t from-white/20 via-transparent to-black/50 pointer-events-none" />

          <div className="relative z-10 my-auto text-center px-2">
            <div className="w-8 h-8 mx-auto rounded-full border border-white/20 flex items-center justify-center text-white/50 mb-1">
              <BookOpen className="w-3.5 h-3.5" />
            </div>
            <div className="text-[9px] tracking-widest uppercase font-serif text-white/60">
              {book.series || 'Physical Copy'}
            </div>
          </div>

          <div className="relative z-10 p-3 space-y-1">
            <p className="text-[10px] font-semibold tracking-wider uppercase text-white/80 line-clamp-1">
              {book.author}
            </p>
            <h4 className="text-xs font-black tracking-tight leading-snug line-clamp-2 text-white">
              {book.workTitle}
            </h4>
          </div>
        </>
      )}

      <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/50 via-white/10 to-transparent pointer-events-none z-10" />
      <div className="absolute inset-y-0 left-3 w-px bg-white/20 pointer-events-none z-10" />
      <div className="absolute inset-y-0 right-0 w-1 bg-black/20 pointer-events-none z-10" />

      <div className="relative z-10 p-2.5 flex items-start justify-between pointer-events-none">
        {book.series ? (
          <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-amber-300 border border-amber-300/30 shadow-xs">
            #{book.seriesNumber}
          </span>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

// Card Wrapper for Grid Views
function AppleBookCard({ book, onClick, onAuthorClick, onToggleWishlist }) {
  return (
    <div
      onClick={onClick}
      className="group cursor-pointer flex flex-col transition-all duration-200 transform hover:-translate-y-1.5"
    >
      <div className="relative">
        <AppleBookCover book={book} />
        <button
          onClick={onToggleWishlist}
          className="absolute top-2.5 right-2.5 z-20 w-7 h-7 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center hover:bg-black/75 transition-colors shadow-xs"
        >
          <Heart className={`w-3.5 h-3.5 ${book.isWishlist ? 'text-red-400 fill-red-400' : 'text-white/80'}`} />
        </button>
      </div>

      <div className="mt-2 space-y-0.5">
        <h4 className="text-xs font-bold text-slate-800 truncate group-hover:text-orange-600 transition-colors">
          {book.workTitle}
        </h4>
        <button
          onClick={onAuthorClick}
          className="text-[11px] text-slate-500 hover:text-orange-600 hover:underline transition-colors truncate block text-left"
        >
          {book.author}
        </button>
        <div className="flex items-center justify-between pt-1 text-[10px]">
          <span className="text-slate-400 flex items-center gap-1 font-medium">
            <span className={`w-1.5 h-1.5 rounded-full ${book.readingStatus === 'Reading' ? 'bg-orange-500' : book.readingStatus === 'Completed' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            {book.readingStatus}
          </span>
          {book.series && (
            <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
              #{book.seriesNumber}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
