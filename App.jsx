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
  ExternalLink,
  Pencil
} from 'lucide-react';
import { api } from './src/api.js';
import EditBookModal from './src/EditBookModal.jsx';

// Fallback background palettes when an image is loading or unavailable
const COVER_THEMES = [
  { bg: 'from-amber-900 via-stone-900 to-black', accent: 'border-amber-400/40 text-amber-200', tag: 'bg-amber-500/20 text-amber-300' },
  { bg: 'from-slate-900 via-blue-950 to-black', accent: 'border-blue-400/40 text-blue-200', tag: 'bg-blue-500/20 text-blue-300' },
  { bg: 'from-emerald-950 via-teal-950 to-black', accent: 'border-emerald-400/40 text-emerald-200', tag: 'bg-emerald-500/20 text-emerald-300' },
  { bg: 'from-rose-950 via-red-950 to-stone-950', accent: 'border-rose-400/40 text-rose-200', tag: 'bg-rose-500/20 text-rose-300' },
  { bg: 'from-indigo-950 via-purple-950 to-neutral-950', accent: 'border-purple-400/40 text-purple-200', tag: 'bg-purple-500/20 text-purple-300' },
  { bg: 'from-cyan-950 via-sky-950 to-black', accent: 'border-cyan-400/40 text-cyan-200', tag: 'bg-cyan-500/20 text-cyan-300' }
];

export default function App() {
  // Authentication state. The server remembers who is signed in (with a secure cookie),
  // so the browser no longer stores passwords or anyone's books.
  const [currentUser, setCurrentUser] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [hasUsers, setHasUsers] = useState(true);

  // The signed-in user's books, loaded from the server.
  const [books, setBooks] = useState([]);
  const [isLibraryLoaded, setIsLibraryLoaded] = useState(false);
  const [libraryError, setLibraryError] = useState(null);
  const [saveError, setSaveError] = useState(null);

  // Auth Screen Form State
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);

  // On first load: ask the server whether we're already signed in.
  useEffect(() => {
    api.getSession()
      .then(({ user, hasUsers }) => {
        setCurrentUser(user);
        setHasUsers(hasUsers);
        if (!hasUsers) setAuthMode('register');
      })
      .catch(() => setAuthError('Could not reach the server. Please refresh the page.'))
      .finally(() => setIsCheckingSession(false));
    // Clean up data left in the browser by the old version of the app.
    ['personal_library_users', 'personal_library_current_user', 'personal_library_data']
      .forEach(key => localStorage.removeItem(key));
  }, []);

  // Whenever someone signs in, load their books.
  useEffect(() => {
    if (!currentUser) {
      setBooks([]);
      setIsLibraryLoaded(false);
      return;
    }
    setLibraryError(null);
    api.listBooks()
      .then(setBooks)
      .catch(err => setLibraryError(err.message))
      .finally(() => setIsLibraryLoaded(true));
  }, [currentUser]);

  // If the server says our sign-in expired, go back to the sign-in screen.
  const handleApiError = (err) => {
    if (err.status === 401) {
      setCurrentUser(null);
      setAuthError('Your session ended. Please sign in again.');
      return;
    }
    setSaveError(err.message || 'Could not save your change.');
  };

  // Book changes: update the screen right away, then save to the server.
  // If saving fails, the change is undone and an error is shown.
  const addBook = async (book) => {
    const tempId = 'temp-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    setBooks(prev => [{ ...book, id: tempId }, ...prev]);
    try {
      const saved = await api.createBook(book);
      setBooks(prev => prev.map(b => (b.id === tempId ? saved : b)));
      return saved;
    } catch (err) {
      setBooks(prev => prev.filter(b => b.id !== tempId));
      handleApiError(err);
      return null;
    }
  };

  const updateBook = async (bookId, changes) => {
    const before = books.find(b => b.id === bookId);
    if (!before) return null;
    setBooks(prev => prev.map(b => (b.id === bookId ? { ...b, ...changes } : b)));
    setSelectedBook(prev => (prev && prev.id === bookId ? { ...prev, ...changes } : prev));
    try {
      const saved = await api.updateBook(bookId, changes);
      setBooks(prev => prev.map(b => (b.id === bookId ? saved : b)));
      return saved;
    } catch (err) {
      setBooks(prev => prev.map(b => (b.id === bookId ? before : b)));
      setSelectedBook(prev => (prev && prev.id === bookId ? before : prev));
      handleApiError(err);
      return null;
    }
  };

  const removeBook = async (bookId) => {
    const before = books;
    setBooks(prev => prev.filter(b => b.id !== bookId));
    try {
      await api.deleteBook(bookId);
    } catch (err) {
      setBooks(before);
      handleApiError(err);
    }
  };

  // Keep the latest values in refs so the camera scanning loop (which runs on a timer)
  // always sees the current book list instead of the list from when the camera opened.
  const booksRef = useRef(books);
  booksRef.current = books;
  const isLookingUpRef = useRef(false);

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
  const [manualShelf, setManualShelf] = useState('Living Room Shelf');
  const [manualOwned, setManualOwned] = useState(true);

  // Edit Book Details modal
  const [editingBook, setEditingBook] = useState(null);

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
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');

    const cleanEmail = authEmail.trim().toLowerCase();
    if (!cleanEmail || !authPassword) {
      setAuthError('Please fill out all required fields.');
      return;
    }
    if (authMode === 'register' && authPassword.length < 8) {
      setAuthError('Password must be at least 8 characters long.');
      return;
    }

    setIsAuthSubmitting(true);
    try {
      const user = authMode === 'login'
        ? await api.login(cleanEmail, authPassword)
        : await api.register(cleanEmail, authPassword, authDisplayName.trim());
      setHasUsers(true);
      setCurrentUser(user);
      setAuthEmail('');
      setAuthPassword('');
      setAuthDisplayName('');
    } catch (err) {
      setAuthError(err.message || 'Could not connect to the server. Please try again.');
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await api.logout().catch(() => {});
    setCurrentUser(null);
    setSelectedBook(null);
    setIsScanModalOpen(false);
    setIsManualAddOpen(false);
    setActiveSection('all');
    setSearchQuery('');
  };

  // Real-time lookup for ISBN
  const handleLookupIsbn = async (rawIsbn) => {
    const raw = (rawIsbn || scannedIsbnInput).trim().replace(/[^0-9X]/gi, '');
    if (!raw) return;
   if (raw.length !== 10 && raw.length !== 12 && raw.length !== 13) return;
    const existing = booksRef.current.find(b =>
      (b.editions || []).some(e => String(e.isbn || '').replace(/[^0-9X]/gi, '') === raw)
    );
    if (existing) {
      setDuplicateAlert({
        book: existing,
        message: existing.owned === false
          ? `"${existing.workTitle}" by ${existing.author} is already on your wishlist.`
          : `You already own this book: "${existing.workTitle}" by ${existing.author} on shelf "${existing.shelfLocation || 'Living Room Shelf'}".`
      });
      setScanResult(null);
      return;
    }

    setDuplicateAlert(null);
    setIsLookingUpIsbn(true);
    isLookingUpRef.current = true;
try {
 const cleanIsbn = raw.replace(/[^0-9X]/gi, '');
    
    // 1. Try Google Books
    const gQuery = cleanIsbn.length === 12 ? `q=${cleanIsbn}` : `q=isbn:${cleanIsbn}`;
    const gRes = await fetch(`https://www.googleapis.com/books/v1/volumes?${gQuery}`).catch(() => null);
    if (gRes && gRes.ok) {
      const gData = await gRes.json();
     if (gData.items && gData.items.length > 0) {
        const info = gData.items[0].volumeInfo;
        const authorName = info.authors ? info.authors.join(', ') : '';
        if (authorName) {
          const coverSet = new Set();
          if (info.imageLinks?.thumbnail) {
            coverSet.add(info.imageLinks.thumbnail.replace('http://', 'https://'));
          }
          coverSet.add(`https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg`);

          const searchRes = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(info.title)}&author=${encodeURIComponent(authorName)}&limit=1`).catch(() => null);
          if (searchRes && searchRes.ok) {
            const sData = await searchRes.json();
            const doc = sData.docs?.[0];
            if (doc?.cover_i) {
              coverSet.add(`https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`);
            }
            if (Array.isArray(doc?.edition_key)) {
              doc.edition_key.slice(0, 8).forEach(k => {
                coverSet.add(`https://covers.openlibrary.org/b/olid/${k}-L.jpg`);
              });
            }
          }

          const availableCovers = Array.from(coverSet);

          setScanResult({
            workTitle: info.title || 'Untitled Book',
            author: authorName,
            series: null,
            seriesNumber: null,
            coverUrl: availableCovers[0] || null,
            availableCovers,
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
   const bibkey = cleanIsbn.length === 12 ? `UPC:${cleanIsbn}` : `ISBN:${cleanIsbn}`;
  const olRes = await fetch(`https://openlibrary.org/api/books?bibkeys=${bibkey}&format=json&jscmd=data`).catch(() => null);
  if (olRes && olRes.ok) {
    const olData = await olRes.json();
    const bookKey = bibkey;
      if (olData[bookKey]) {
      const book = olData[bookKey];
        const authorName = book.authors ? book.authors.map(a => a.name).join(', ') : '';
        const workTitle = book.title || 'Untitled Book';

        const coverSet = new Set();
        if (book.cover?.large) coverSet.add(book.cover.large);
        if (book.cover?.medium) coverSet.add(book.cover.medium);
        coverSet.add(`https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg`);

        const searchRes = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(workTitle)}&limit=1`).catch(() => null);
        if (searchRes && searchRes.ok) {
          const sData = await searchRes.json();
          const doc = sData.docs?.[0];
          if (doc?.cover_i) coverSet.add(`https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`);
          if (Array.isArray(doc?.edition_key)) {
            doc.edition_key.slice(0, 8).forEach(k => {
              coverSet.add(`https://covers.openlibrary.org/b/olid/${k}-L.jpg`);
            });
          }
        }

        const availableCovers = Array.from(coverSet);

        setScanResult({
          workTitle,
          author: authorName || 'Unknown Author',
          series: null,
          seriesNumber: null,
          coverUrl: availableCovers[0] || null,
          availableCovers,
          edition: {
            title: workTitle,
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
      isLookingUpRef.current = false;
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
      // 1. Search Open Library by author specific field with a higher capacity
    const res = await fetch(`https://openlibrary.org/search.json?author=${cleanQ}&language=eng&limit=1000`, {
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

        // Create a fast lookup Set of normalized owned titles and ISBNs
        const ownedTitleSet = new Set(
          (books || []).filter(b => b.owned !== false).map(b => (b.workTitle || b.title || '').trim().toLowerCase())
        );
        const ownedIsbnSet = new Set(
          (books || []).filter(b => b.owned !== false).flatMap(b => (b.editions || []).map(e => (e.isbn || '').trim()))
        );

       // Helper to strip leading articles ("The", "A", "An") and symbols for matching
      const getCanonicalTitleKey = (rawTitle) => {
        let t = rawTitle.toLowerCase().trim();
        // If title has a slash (e.g. "Armadura de la Luz / The Armor of Light"), extract the parts
        if (t.includes('/')) {
          const parts = t.split('/').map(p => p.trim());
          // Prefer parts that don't start with common Spanish prefixes if an English side exists
          const englishPart = parts.find(p => !p.startsWith('el ') && !p.startsWith('la ') && !p.startsWith('las ') && !p.startsWith('los ') && !p.startsWith('una ') && !p.startsWith('un '));
          t = englishPart || parts[0];
        }
        return t.replace(/^(the|a|an)\s+/i, '').replace(/[^a-z0-9]/g, '');
      };

      const booksMap = new Map();

      for (const doc of data.docs) {
        if (!doc.title) continue;

       const docLangs = Array.isArray(doc.language) ? doc.language : [];

      // 1. Always preserve books in your personal collection
        const isDocOwned = 
          ownedTitleSet.has(doc.title.trim().toLowerCase()) || 
          ownedTitleSet.has(getCanonicalTitleKey(doc.title)) ||
          (doc.isbn && doc.isbn.some(code => ownedIsbnSet.has(code)));

        if (!isDocOwned) {
          // 1. Language metadata check: If Open Library specifies languages, reject if English is missing
          const rawLangs = Array.isArray(doc.language) ? doc.language : [doc.language];
          const langs = rawLangs.filter(Boolean).map(l => String(l).toLowerCase().trim());
          if (langs.length > 0 && !langs.some(l => l === 'eng' || l === 'en' || l.startsWith('en-'))) {
            continue;
          }

          // 2. Reject non-ASCII characters (catches accented titles like Colección, Mundo, Coluna, etc.)
          if (/[^\u0000-\u007F]/.test(doc.title)) {
            continue;
          }

          // 3. Reject box sets and omnibus dumps
          if (/\b(\d+\s*books?\s*set|box\s*set|collection|trilogy\s*set|paperback)\b/i.test(doc.title)) {
            continue;
          }

          // 4. English structural word check for multi-word titles
          const titleWords = doc.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
          const englishConnectors = new Set([
            'the', 'a', 'an', 'and', 'of', 'in', 'to', 'for', 'with', 'on', 'at',
            'from', 'by', 'about', 'as', 'into', 'like', 'through', 'after',
            'over', 'between', 'out', 'against', 'during', 'without', 'before',
            'under', 'around', 'among', 'is', 'are', 'was', 'were', 'be', 'been',
            'no', 'not', 'all', 'any', 'my', 'your', 'his', 'her', 'their', 'our',
            'man', 'world', 'time', 'day', 'night', 'dark', 'light', 'fire'
          ]);

          const hasEnglishConnector = titleWords.some(w => englishConnectors.has(w));
          const isSingleWordTitle = titleWords.length === 1;

          if (!hasEnglishConnector && !isSingleWordTitle) {
            continue;
          }
        }

      // 6. Extract primary display title (strip foreign half if slash-separated)
        let displayTitle = doc.title;
        if (displayTitle.includes('/')) {
          const parts = displayTitle.split('/').map(p => p.trim());
          const engCandidate = parts.find(p => !/^(el|la|los|las|un|una|il|lo|le|das|der|die|nunca)\b/i.test(p));
          displayTitle = engCandidate || parts[parts.length - 1];
        }
        const canonicalKey = getCanonicalTitleKey(displayTitle);

        // Language label for edition tracking
        const editionLanguage = docLangs.includes('spa') ? 'Spanish' : docLangs.includes('eng') || docLangs.length === 0 ? 'English' : docLangs[0].toUpperCase();

        const editionEntry = {
          id: `ed-${doc.key || Math.random().toString(36).substring(2, 9)}`,
          title: doc.title,
          language: editionLanguage,
          format: 'Paperback',
          isbn: doc.isbn ? doc.isbn[0] : 'Pending Scan',
          published: doc.first_publish_year ? String(doc.first_publish_year) : 'Unknown',
          publisher: (doc.publisher && doc.publisher[0]) || 'Publisher'
        };

        if (booksMap.has(canonicalKey)) {
          // Attach translation/edition under the master English work
          const master = booksMap.get(canonicalKey);
          if (!master.editions.some(e => e.isbn === editionEntry.isbn && e.title === editionEntry.title)) {
            master.editions.push(editionEntry);
          }
        } else {
          // If this is a standalone translation work with no English match in catalog, skip it

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

          const normalizedTitle = displayTitle.trim().toLowerCase();
          const isOwned =
            ownedTitleSet.has(normalizedTitle) ||
            ownedTitleSet.has(getCanonicalTitleKey(displayTitle)) ||
            (isbn && ownedIsbnSet.has(isbn));

          booksMap.set(canonicalKey, {
            id: doc.key || `ol-${booksMap.size}-${Date.now()}`,
            title: displayTitle,
            author: matchingAuthor,
            publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : 'Unknown',
            description: 'Catalog bibliography entry.',
            coverUrl: cover,
            isbn: isbn || 'Pending Scan',
            category: (doc.subject && doc.subject[0]) || 'Fiction',
            isOwned: Boolean(isOwned),
            editions: [editionEntry]
          });
        }
      }

      const foundBooks = Array.from(booksMap.values());

        // Sort so owned books appear first, followed by publication year descending
        foundBooks.sort((a, b) => {
          if (a.isOwned !== b.isOwned) return a.isOwned ? -1 : 1;
          const yearA = parseInt(a.publishedDate, 10) || 0;
          const yearB = parseInt(b.publishedDate, 10) || 0;
          return yearB - yearA;
        });

       if (foundBooks.length > 0) {
        setViewingGlobalAuthor({
          name: resolvedDisplayName,
          bio: `Catalog bibliography for ${resolvedDisplayName}. (${foundBooks.filter(b => b.isOwned).length} of ${foundBooks.length} owned)`,
          books: foundBooks
      });
    } else {
      setAuthorSearchError(`No catalog records found matching "${query}". Check spelling or try a different name.`);
    }
  }
} catch (err) {
      setAuthorSearchError('Connection timeout or rate limit from catalog.');
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
      all: books.filter(b => b.owned !== false).length,
      reading: books.filter(b => b.readingStatus === 'Reading' && b.owned !== false).length,
      unread: books.filter(b => b.readingStatus === 'Unread' && b.owned !== false).length,
      completed: books.filter(b => b.readingStatus === 'Completed' && b.owned !== false).length,
      wishlist: books.filter(b => b.owned === false).length,
      authors: libraryAuthors.length,
      series: Array.from(new Set(books.map(b => b.series).filter(Boolean))).length
    };
  }, [books, libraryAuthors]);

  const filteredBooks = useMemo(() => {
    return books.filter(b => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        (b.workTitle || '').toLowerCase().includes(q) ||
        (b.author || '').toLowerCase().includes(q) ||
        (b.series && b.series.toLowerCase().includes(q)) ||
        (b.editions || []).some(e => String(e.isbn || '').toLowerCase().includes(q));

      if (!matchesSearch) return false;

      // "owned: false" means the book is on the wishlist (wanted, not on the shelf yet).
      if (activeSection === 'all') return b.owned !== false;
      if (activeSection === 'reading') return b.readingStatus === 'Reading' && b.owned !== false;
      if (activeSection === 'unread') return b.readingStatus === 'Unread' && b.owned !== false;
      if (activeSection === 'completed') return b.readingStatus === 'Completed' && b.owned !== false;
      if (activeSection === 'wishlist') return b.owned === false;
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
      if (!video || video.readyState < 2 || isLookingUpRef.current) return;

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

  // Move a book between "on my shelves" (owned) and "wishlist" (wanted).
  const setOwned = (bookId, owned) => updateBook(bookId, { owned });

  const deleteBook = (bookId, e) => {
    e?.stopPropagation();
    const book = books.find(b => b.id === bookId);
    const where = book?.owned === false ? 'your wishlist' : 'your shelves';
    if (confirm(`Remove this book from ${where}?`)) {
      removeBook(bookId);
      if (selectedBook?.id === bookId) setSelectedBook(null);
    }
  };

  const handleAddScannedBook = () => {
    if (!scanResult) return;
    const newBook = {
      workTitle: scanResult.workTitle,
      author: scanResult.author,
      series: scanResult.series,
      seriesNumber: scanResult.seriesNumber,
      owned: true,
      readingStatus: 'Unread',
      shelfLocation: 'Living Room Shelf',
      customCoverUrl: scanResult.coverUrl,
      theme: COVER_THEMES[Math.floor(Math.random() * COVER_THEMES.length)],
      editions: [{ id: `ed-${Date.now()}`, ...scanResult.edition }]
    };
    addBook(newBook);
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
      workTitle: manualTitle.trim(),
      author: manualAuthor.trim(),
      series: manualSeries.trim() || null,
      seriesNumber: manualSeriesNum ? parseFloat(manualSeriesNum) : null,
      owned: manualOwned,
      readingStatus: 'Unread',
      shelfLocation: manualOwned ? (manualShelf.trim() || 'Living Room Shelf') : '',
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

    addBook(newBook);
    setManualTitle('');
    setManualAuthor('');
    setManualSeries('');
    setManualSeriesNum('');
    setManualIsbn('');
    setManualOwned(true);
    setIsManualAddOpen(false);
  };

  // Add a book found in the author search, either to the shelves (owned) or the wishlist.
  const addCatalogBook = (item, owned) => {
    addBook({
      workTitle: item.title,
      author: item.author,
      series: null,
      seriesNumber: null,
      owned,
      readingStatus: 'Unread',
      shelfLocation: owned ? 'Living Room Shelf' : '',
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
    });
    // Instantly show the new status in the search results
    setViewingGlobalAuthor(prev => prev ? ({
      ...prev,
      books: prev.books.map(b => b.id === item.id ? { ...b, isOwned: owned, isWanted: !owned } : b)
    }) : null);
  };

  const navigateToAuthor = (authorName, e) => {
    e?.stopPropagation();
    setSelectedAuthor(authorName);
    setViewingGlobalAuthor(null);
    setActiveSection('authors');
    setCurrentPage(1);
    if (selectedBook) setSelectedBook(null);
  };

  // While we ask the server whether someone is already signed in
  if (isCheckingSession) {
    return (
      <div className="min-h-screen w-full bg-[#0f1117] flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-orange-400 animate-spin" />
      </div>
    );
  }

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
                  placeholder={authMode === 'register' ? 'At least 8 characters' : '••••••••'}
                  autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
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
              disabled={isAuthSubmitting}
              className="w-full py-3 disabled:opacity-60 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 active:scale-[0.99] text-white text-xs font-bold rounded-xl shadow-lg shadow-orange-500/25 transition-all mt-2"
            >
              {isAuthSubmitting ? 'One moment…' : authMode === 'login' ? 'Sign In to My Library' : 'Create My Account & Enter'}
            </button>
          </form>

          {!hasUsers && (
            <div className="pt-4 border-t border-slate-800/80 text-center">
              <p className="text-[11px] text-slate-400">
                Welcome! No accounts exist yet. The first account you create becomes the library's owner.
              </p>
            </div>
          )}
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
                        <div 
                key={item.id} 
                className={`p-3 rounded-xl flex gap-3 items-center border transition-all ${
                  item.isOwned 
                    ? 'bg-emerald-50/50 border-emerald-200' 
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className={`w-14 h-20 bg-slate-200 rounded-md overflow-hidden flex-shrink-0 shadow-2xs transition-all ${
                  item.isOwned ? '' : 'grayscale opacity-60 hover:opacity-100'
                }`}>
                  {item.coverUrl ? (
                    <img src={item.coverUrl} alt={item.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 text-[10px] text-center p-1">No Cover</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <div className="text-xs font-bold text-slate-900 truncate" title={item.title}>
                      {item.title}
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {item.publishedDate} • {item.category}
                  </div>
                  
                  {item.isOwned ? (
                    <div className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-semibold rounded-md border border-emerald-200">
                      <span>✓</span> In Collection
                    </div>
                  ) : item.isWanted ? (
                    <div className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 bg-rose-50 text-rose-700 text-[10px] font-semibold rounded-md border border-rose-200">
                      <Heart className="w-3 h-3" /> On Wishlist
                    </div>
                  ) : (
                    <div className="flex gap-1.5 mt-2">
                      <button
                        onClick={() => addCatalogBook(item, true)}
                        className="px-2.5 py-1 bg-orange-500 hover:bg-orange-600 text-white text-[10px] font-semibold rounded-lg shadow-2xs cursor-pointer transition-colors"
                      >
                        + I Own This
                      </button>
                      <button
                        onClick={() => addCatalogBook(item, false)}
                        className="px-2.5 py-1 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-[10px] font-semibold rounded-lg cursor-pointer transition-colors"
                      >
                        + Wishlist
                      </button>
                    </div>
                 )}
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
                  onClick={() => setEditingBook(selectedBook)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-orange-600 rounded-lg hover:bg-orange-50 transition-colors"
                  title="Edit book details"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
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

                  <div className="pt-1">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setOwned(selectedBook.id, true)}
                        className={`py-2 text-xs rounded-xl font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                          selectedBook.owned !== false
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <Library className="w-3.5 h-3.5" /> On My Shelf
                      </button>
                      <button
                        onClick={() => setOwned(selectedBook.id, false)}
                        className={`py-2 text-xs rounded-xl font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                          selectedBook.owned === false
                            ? 'bg-rose-500 text-white border-rose-500 shadow-xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <Heart className="w-3.5 h-3.5" /> Wishlist
                      </button>
                    </div>
                  </div>

                  <div className="pt-2">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                      Reading Status for {currentUser.displayName}
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {['Unread', 'Reading', 'Completed'].map(status => (
                        <button
                          key={status}
                          onClick={() => updateBook(selectedBook.id, { readingStatus: status })}
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
                              const updatedEditions = [...selectedBook.editions];
                              updatedEditions[activeEditionIndex] = { ...updatedEditions[activeEditionIndex], isbn: clean };
                              // Only replace the cover if the book was using the automatic one for the old ISBN
                              const oldIsbn = selectedBook.editions[activeEditionIndex].isbn;
                              const usesAutoCover = !selectedBook.customCoverUrl || selectedBook.customCoverUrl.includes(`/isbn/${oldIsbn}-`);
                              updateBook(selectedBook.id, {
                                editions: updatedEditions,
                                ...(usesAutoCover ? { customCoverUrl: newCoverUrl } : {})
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
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setManualOwned(true)}
                  className={`py-2 text-xs rounded-xl font-semibold border transition-all ${manualOwned ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200'}`}
                >
                  I own this
                </button>
                <button
                  type="button"
                  onClick={() => setManualOwned(false)}
                  className={`py-2 text-xs rounded-xl font-semibold border transition-all ${!manualOwned ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-slate-600 border-slate-200'}`}
                >
                  Add to wishlist
                </button>
              </div>

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
                    step="any"
                    min="0"
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

              {manualOwned && <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">Shelf Location</label>
                <input
                  type="text"
                  value={manualShelf}
                  onChange={(e) => setManualShelf(e.target.value)}
                  placeholder="e.g. Living Room Shelf 2, Study"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500"
                />
              </div>}

              <button
                type="submit"
                className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-xl shadow-xs transition-all mt-4"
              >
                {manualOwned ? '+ Place On Shelf' : '+ Add to Wishlist'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT BOOK DETAILS */}
      {editingBook && (
        <EditBookModal
          book={editingBook}
          onCancel={() => setEditingBook(null)}
          onSave={async (changes) => {
            const saved = await updateBook(editingBook.id, changes);
            if (saved) setEditingBook(null);
            return saved;
          }}
        />
      )}

      {/* Loading and error messages */}
      {(!isLibraryLoaded || libraryError || saveError) && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] max-w-md w-[calc(100%-2rem)]">
          {!isLibraryLoaded && !libraryError && (
            <div className="px-4 py-3 rounded-2xl bg-slate-900 text-white text-xs font-medium shadow-xl flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading your library…
            </div>
          )}
          {(libraryError || saveError) && (
            <div className="px-4 py-3 rounded-2xl bg-red-600 text-white text-xs font-medium shadow-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span className="flex-1">
                {libraryError ? `Could not load your library: ${libraryError}` : saveError}
              </span>
              <button
                onClick={() => (libraryError ? window.location.reload() : setSaveError(null))}
                className="font-bold underline flex-shrink-0"
              >
                {libraryError ? 'Retry' : 'Dismiss'}
              </button>
            </div>
          )}
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
              {scanMode === 'camera' ? (
                <div className="space-y-3">
                  <div className="relative aspect-video bg-black rounded-2xl overflow-hidden flex items-center justify-center border border-slate-800">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 border-2 border-orange-500/50 rounded-2xl pointer-events-none" />
                  </div>
                  {cameraError && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
                      {cameraError}
                    </div>
                  )}
                  {scanSuccessFeedback && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl text-center font-semibold">
                      Barcode Detected!
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter 10 or 13 digit ISBN..."
                      value={scannedIsbnInput}
                      onChange={(e) => setScannedIsbnInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleLookupIsbn(scannedIsbnInput); }}
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    />
                    <button
                      onClick={() => handleLookupIsbn(scannedIsbnInput)}
                      disabled={isLookingUpIsbn || !scannedIsbnInput.trim()}
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
              )}

              {duplicateAlert && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                  <div className="text-xs text-amber-800 font-medium">
                    {duplicateAlert.message}
                  </div>
                </div>
              )}

              {scanResult && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-3">
                  <div className="flex gap-4 items-start">
                    <div className="w-16 h-24 bg-white rounded-lg border border-emerald-200 overflow-hidden shrink-0 shadow-xs">
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

                    <div className="text-xs min-w-0 flex-1 space-y-1">
                      <div className="font-bold text-slate-900 text-sm truncate">{scanResult.workTitle}</div>
                      <div className="text-slate-600">by {scanResult.author}</div>
                      <div className="text-[11px] text-slate-500">
                        {scanResult.edition.published} • {scanResult.edition.format}
                      </div>

                      {scanResult.availableCovers && scanResult.availableCovers.length > 0 && (
                  <div className="pt-2">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                      Choose Cover Edition:
                    </span>
                    <div className="flex gap-2 overflow-x-auto pb-1 max-w-[280px]">
                      {scanResult.availableCovers.map((url, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setScanResult(prev => ({ ...prev, coverUrl: url }))}
                          className={`relative shrink-0 w-11 h-16 rounded-md overflow-hidden border-2 transition-all ${
                            scanResult.coverUrl === url
                              ? 'border-emerald-600 ring-2 ring-emerald-500/30 scale-105'
                              : 'border-slate-200 hover:border-slate-400 opacity-70 hover:opacity-100'
                          }`}
                        >
                          <img
                            src={url}
                            alt="Cover Option"
                            className="w-full h-full object-cover"
                            onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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
function AppleBookCard({ book, onClick, onAuthorClick }) {
  return (
    <div
      onClick={onClick}
      className="group cursor-pointer flex flex-col transition-all duration-200 transform hover:-translate-y-1.5"
    >
      <div className="relative">
        <AppleBookCover book={book} />
        {book.owned === false && (
          <span
            className="absolute top-2.5 right-2.5 z-20 w-7 h-7 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center shadow-xs"
            title="On your wishlist"
          >
            <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400" />
          </span>
        )}
      </div>

      <div className="mt-2 space-y-0.5">
        <h4 className="text-xs font-bold text-slate-800 truncate group-hover:text-orange-600 transition-colors">
          {book.workTitle}
        </h4>
        <button
          onClick={(e) => { e.stopPropagation(); onAuthorClick?.(e); }}
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
