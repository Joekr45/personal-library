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
  ArrowRight,
  Trash2,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ExternalLink,
  Pencil,
  Menu,
  ImagePlus,
  Settings,
  Trophy,
  BadgeCheck,
  HandHelping,
  ShoppingBag,
  Sparkles,
  Tags,
  Quote,
  Flag,
  BellRing,
  Activity,
  Compass,
  MessagesSquare,
  ListOrdered,
  Timer,
  Gift,
  CircleSlash
} from 'lucide-react';
import { api } from './src/api.js';
import EditBookModal from './src/EditBookModal.jsx';
import ScannerModal from './src/ScannerModal.jsx';
import { LANGUAGES } from './src/languages.js';
import CoverPicker from './src/CoverPicker.jsx';
import AuthorPage from './src/AuthorPage.jsx';
import SeriesPage from './src/SeriesPage.jsx';
import SettingsModal from './src/SettingsModal.jsx';
import ReadingPanel from './src/ReadingPanel.jsx';
import StarRating from './src/StarRating.jsx';
import MyYearPage, { UpNext } from './src/MyYearPage.jsx';
import SortFilterBar, { SORTERS, EMPTY_FILTERS, applyFilters } from './src/SortFilterBar.jsx';
import { statusChanges } from './src/reading.js';
import LendPanel from './src/LendPanel.jsx';
import FamilyPage from './src/FamilyPage.jsx';
import ShoppingList from './src/ShoppingList.jsx';
import { sameBook, currentLoan } from './src/matching.js';
import ImportModal from './src/ImportModal.jsx';
import NewForYouPage from './src/NewForYouPage.jsx';
import ShelvesPanel from './src/ShelvesPanel.jsx';
import ProgressPanel from './src/ProgressPanel.jsx';
import { allShelves, hasTag, renameTag, tagsOf, progressOf } from './src/shelves.js';
import QuotesPanel from './src/QuotesPanel.jsx';
import CollectorPanel from './src/CollectorPanel.jsx';
import FindItLinks from './src/FindItLinks.jsx';
import QuotesPage from './src/QuotesPage.jsx';
import ChallengesPage from './src/ChallengesPage.jsx';
import { overdueBooks, reminderText, shareOrCopy } from './src/lending.js';
import BookInfoPanel from './src/BookInfoPanel.jsx';
import ReviewPanel from './src/ReviewPanel.jsx';
import MoodPanel from './src/MoodPanel.jsx';
import SharePanel from './src/SharePanel.jsx';
import ActivityPage from './src/ActivityPage.jsx';
import DiscoverPage from './src/DiscoverPage.jsx';
import ClubsPage from './src/ClubsPage.jsx';
import ListsPage from './src/ListsPage.jsx';
import ReadingLogPage from './src/ReadingLogPage.jsx';
import GiftsPage from './src/GiftsPage.jsx';
import WishlistAlerts from './src/WishlistAlerts.jsx';
import SidebarMenu from './src/SidebarMenu.jsx';
import HomePage from './src/HomePage.jsx';
import { toIsbn13 } from './shared/isbn.js';

// Fallback background palettes when an image is loading or unavailable
// Alphabetical by title, the way libraries do it: "The", "A" and "An" at the start are ignored
// ("The Pillars of the Earth" is filed under P), and numbers sort naturally (2 before 10).
const sortKey = (title) => String(title || '').trim().replace(/^(the|a|an)\s+/i, '');
const titleCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const byTitle = (a, b) => titleCollator.compare(sortKey(a.workTitle), sortKey(b.workTitle)) || titleCollator.compare(a.author || '', b.author || '');

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
  const [signupMode, setSignupMode] = useState('invite'); // 'invite' | 'open' | 'closed'
  // An invite link looks like https://your-server/?invite=K7QP-3MZD
  const [inviteCode, setInviteCode] = useState(() => new URLSearchParams(window.location.search).get('invite') || '');

  // The signed-in user's books, loaded from the server.
  const [books, setBooks] = useState([]);
  const [isLibraryLoaded, setIsLibraryLoaded] = useState(false);
  const [libraryError, setLibraryError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [settings, setSettings] = useState(null); // { isOwner, hardcover: { connected, username } }
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [family, setFamily] = useState(null); // shared family shelves { sharing, members }
  const [isShoppingListOpen, setIsShoppingListOpen] = useState(false);
  const [scannerInitialMode, setScannerInitialMode] = useState(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [newReleases, setNewReleases] = useState(null); // { releases, authorsChecked } or { error }
  const [prefs, setPrefs] = useState({}); // e.g. { libbyLibrary: 'nypl' }
  const [inboxCount, setInboxCount] = useState(0); // books recommended to you, not answered yet
  const [navTick, setNavTick] = useState(0); // changes on every menu tap, so pages reload fresh
  const [bookTab, setBookTab] = useState('reading'); // which tab of the book page is showing (kept between books)
  const loadNewReleases = () => {
    setNewReleases(null);
    api.newReleases().then(setNewReleases).catch(err => setNewReleases({ error: err.message, releases: [] }));
  };
  // Friends (not Family) don't use the family features: shared shelves and challenges.
  const isFamily = currentUser?.circle !== 'friend';
  const loadFamily = () => (currentUser?.circle === 'friend'
    ? Promise.resolve(setFamily({ sharing: false, members: [] }))
    : api.family().then(setFamily).catch(() => setFamily({ sharing: false, members: [] })));
  const booksRef = useRef(books);
  booksRef.current = books;

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
      .then(({ user, hasUsers, signupMode: mode }) => {
        setSignupMode(mode || 'open');
        if (!user && new URLSearchParams(window.location.search).get('invite')) setAuthMode('register');
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
    api.getSettings().then(setSettings).catch(() => setSettings(null));
    api.getPrefs().then(setPrefs).catch(() => setPrefs({}));
    api.recommendations().then(r => setInboxCount(r.inbox.length)).catch(() => setInboxCount(0));
    loadFamily();
    api.listBooks()
      .then((list) => { setBooks(list); if (list.length) loadNewReleases(); else setNewReleases({ releases: [], authorsChecked: 0 }); })
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
      if (!saved.series && settings?.hardcover?.connected) fillSeries(saved);
      return saved;
    } catch (err) {
      setBooks(prev => prev.filter(b => b.id !== tempId));
      handleApiError(err);
      return null;
    }
  };

  // A book the server changed by itself (e.g. after filling in its description): show the new version.
  const onBookSaved = (saved) => {
    if (!saved) return;
    setBooks(prev => prev.map(b => (b.id === saved.id ? saved : b)));
    setSelectedBook(prev => (prev && prev.id === saved.id ? saved : prev));
  };

  // Put a book someone recommended (or from a list or Discover) on your wishlist.
  const addRefToWishlist = async (ref) => {
    const exists = booksRef.current.find(b => String(b.workTitle).toLowerCase() === String(ref.title).toLowerCase() &&
      String(b.author).split(',')[0].trim().toLowerCase() === String(ref.author).split(',')[0].trim().toLowerCase());
    if (exists) return exists;
    return addBook({
      workTitle: ref.title, author: ref.author, owned: false, readingStatus: 'Unread', shelfLocation: '',
      customCoverUrl: ref.cover || null, workKey: ref.workKey || null,
      theme: COVER_THEMES[Math.floor(Math.random() * COVER_THEMES.length)],
      editions: [{ id: `ed-${Date.now()}`, title: ref.title, language: 'English', format: 'Physical Print', isbn: ref.isbn || 'Pending Scan', published: 'Unknown', publisher: 'Unknown' }]
    });
  };

  // Ask Hardcover which series a newly added book is in (in the background).
  const fillSeries = async (book) => {
    try {
      const { series } = await api.findSeries({
        isbn: toIsbn13(book.editions?.[0]?.isbn) || '',
        title: book.workTitle,
        author: book.author
      });
      if (series) await updateBook(book.id, { series: series.name, seriesNumber: series.position, hardcoverSeriesId: series.id });
    } catch {
      // not important enough to show an error
    }
  };

  const updateBook = async (bookId, changes) => {
    const before = booksRef.current.find(b => b.id === bookId);
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

  // Save a cover on the server for a book: choice is { url } or { imageData } (a photo).
  const saveCoverFor = async (bookId, choice, { quiet = false } = {}) => {
    try {
      const saved = await api.saveCover(bookId, choice);
      setBooks(prev => prev.map(b => (b.id === bookId ? saved : b)));
      setSelectedBook(prev => (prev && prev.id === bookId ? saved : prev));
      return saved;
    } catch (err) {
      if (err.status === 401) handleApiError(err);
      else if (!quiet) setSaveError(`Could not save that cover: ${err.message}`);
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

  // View state
  const [activeSection, setActiveSection] = useState('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid');

  // Sort and filters for the book lists (remembered on this device)
  const [sortBy, setSortBy] = useState(() => {
    try { return localStorage.getItem('pl_sort') || 'title'; } catch { return 'title'; }
  });
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const changeSort = (value) => {
    setSortBy(value);
    setCurrentPage(1);
    try { localStorage.setItem('pl_sort', value); } catch { /* not important */ }
  };
  const changeFilters = (value) => {
    setFilters(value);
    setCurrentPage(1);
  };
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 36;

  // Author page: which author to open (set when an author's name is tapped anywhere)
  const [authorRequest, setAuthorRequest] = useState(null);

  // Modals & Scanner
  const [selectedBook, setSelectedBook] = useState(null);
  const [activeEditionIndex, setActiveEditionIndex] = useState(0);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);

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
  const [manualLanguage, setManualLanguage] = useState('English');
  const [manualCover, setManualCover] = useState(null); // { url } or { imageData }
  const [isManualCoverPickerOpen, setIsManualCoverPickerOpen] = useState(false);

  // Book detail: choosing a new cover
  const [isDetailCoverPickerOpen, setIsDetailCoverPickerOpen] = useState(false);
  const [isSavingDetailCover, setIsSavingDetailCover] = useState(false);

  // Edit Book Details modal
  const [editingBook, setEditingBook] = useState(null);

  // Phone layout: is the slide-out menu open?
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
        : await api.register(cleanEmail, authPassword, authDisplayName.trim(), inviteCode.trim());
      if (window.location.search.includes('invite=')) window.history.replaceState(null, '', window.location.pathname);
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
    setActiveSection('home');
    setSearchQuery('');
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

  const myShelves = useMemo(() => allShelves(books), [books]);
  const overdue = useMemo(() => overdueBooks(books), [books]);
  const quoteCount = useMemo(() => books.reduce((n, b) => n + (b.quotes || []).length, 0), [books]);
  const [reminderNote, setReminderNote] = useState('');
  const sendReminder = async (book, loan) => {
    const result = await shareOrCopy(reminderText(book, loan, currentUser?.displayName), `About "${book.workTitle}"`);
    setReminderNote(result === 'copied' ? `Reminder for ${loan.to} copied. Paste it into a text or email.` : '');
    setTimeout(() => setReminderNote(''), 4000);
  };
  const activeShelf = activeSection.startsWith('shelf:') ? activeSection.slice(6) : null;

  // Rename or remove one of your shelves on every book that's on it.
  const renameShelf = async (oldName, newName) => {
    const onShelf = booksRef.current.filter(b => hasTag(b, oldName));
    for (const b of onShelf) await updateBook(b.id, { tags: renameTag(b, oldName, newName) });
    setActiveSection(newName ? `shelf:${newName}` : 'all');
    setCurrentPage(1);
  };
  const askRenameShelf = () => {
    const name = prompt('New name for this shelf:', activeShelf);
    const clean = String(name || '').trim().slice(0, 40);
    if (clean && clean !== activeShelf) renameShelf(activeShelf, clean);
  };
  const askDeleteShelf = () => {
    if (confirm(`Remove the shelf "${activeShelf}"? The books stay in your library.`)) renameShelf(activeShelf, '');
  };

  const counts = useMemo(() => {
    return {
      all: books.filter(b => b.owned !== false).length,
      reading: books.filter(b => b.readingStatus === 'Reading' && b.owned !== false).length,
      unread: books.filter(b => b.readingStatus === 'Unread' && b.owned !== false).length,
      completed: books.filter(b => b.readingStatus === 'Completed' && b.owned !== false).length,
      dnf: books.filter(b => b.readingStatus === 'DNF').length,
      wishlist: books.filter(b => b.owned === false).length,
      lent: books.filter(b => currentLoan(b)).length,
      authors: libraryAuthors.length,
      series: Array.from(new Set(books.map(b => b.series).filter(Boolean))).length
    };
  }, [books, libraryAuthors]);

  const filteredBooks = useMemo(() => {
    const matching = books.filter(b => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        (b.workTitle || '').toLowerCase().includes(q) ||
        (b.author || '').toLowerCase().includes(q) ||
        (b.series && b.series.toLowerCase().includes(q)) ||
        tagsOf(b).some(t => t.toLowerCase().includes(q)) ||
        (b.editions || []).some(e => String(e.isbn || '').toLowerCase().includes(q));

      if (!matchesSearch) return false;

      // "owned: false" means the book is on the wishlist (wanted, not on the shelf yet).
      if (activeSection === 'all') return b.owned !== false;
      if (activeSection === 'reading') return b.readingStatus === 'Reading' && b.owned !== false;
      if (activeSection === 'unread') return b.readingStatus === 'Unread' && b.owned !== false;
      if (activeSection === 'completed') return b.readingStatus === 'Completed' && b.owned !== false;
      if (activeSection === 'dnf') return b.readingStatus === 'DNF';
      if (activeSection === 'wishlist') return b.owned === false;
      if (activeSection === 'lent') return Boolean(currentLoan(b));
      if (activeSection.startsWith('shelf:')) return hasTag(b, activeSection.slice(6));
      return true;
    });
    return applyFilters(matching, filters).sort(SORTERS[sortBy] || byTitle);
  }, [books, activeSection, searchQuery, sortBy, filters]);

  const totalPages = Math.ceil(filteredBooks.length / ITEMS_PER_PAGE);
  const paginatedBooks = useMemo(() => {
    if (activeSection === 'authors' || activeSection === 'series') return filteredBooks;
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredBooks.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredBooks, currentPage, activeSection]);

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

  // Open the "type it in yourself" form, optionally pre-filled (e.g. from a failed lookup).
  const openManualAdd = (prefill = {}) => {
    setManualTitle(prefill.title || '');
    setManualAuthor(prefill.author || '');
    setManualIsbn(prefill.isbn || '');
    setManualSeries('');
    setManualSeriesNum('');
    setManualOwned(true);
    setManualLanguage('English');
    setManualCover(null);
    setIsManualAddOpen(true);
  };

  const handleManualAddSubmit = (e) => {
    e.preventDefault();
    if (!manualTitle.trim() || !manualAuthor.trim()) return;

    const typedIsbn = manualIsbn.trim().replace(/[^0-9X]/gi, '');
    const cleanIsbn = toIsbn13(typedIsbn) || typedIsbn || 'Pending Scan';
    const cover = manualCover?.url || (manualCover ? null : cleanIsbn !== 'Pending Scan' ? `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg` : null);

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
        language: manualLanguage,
        format: manualFormat,
        isbn: cleanIsbn,
        published: 'Physical Edition',
        publisher: 'Publisher'
      }]
    };

    const chosenCover = manualCover;
    addBook(newBook).then(saved => {
      if (saved && chosenCover) saveCoverFor(saved.id, chosenCover.imageData ? { imageData: chosenCover.imageData } : { url: chosenCover.url });
    });
    setManualCover(null);
    setManualTitle('');
    setManualAuthor('');
    setManualSeries('');
    setManualSeriesNum('');
    setManualIsbn('');
    setManualOwned(true);
    setIsManualAddOpen(false);
  };

  // Author page: add a book from an author's bibliography straight to the wishlist.
  const addWishlistFromAuthor = async (entry, author) => {
    const cover = entry.cover ? entry.cover.replace(/-M\.jpg$/, '-L.jpg') : null;
    const saved = await addBook({
      workTitle: entry.title,
      author: [author.name, ...(entry.coAuthors || [])].join(', '),
      series: entry.series || null,
      seriesNumber: entry.seriesNumber ?? null,
      hardcoverSeriesId: entry.hardcoverSeriesId || null,
      owned: false,
      readingStatus: 'Unread',
      shelfLocation: '',
      customCoverUrl: cover,
      workKey: entry.workKey || null,
      theme: COVER_THEMES[Math.floor(Math.random() * COVER_THEMES.length)],
      editions: [{
        id: `ed-${Date.now()}`,
        title: entry.title,
        language: 'English',
        format: 'Physical Print',
        isbn: entry.isbn13 || 'Pending Scan',
        published: entry.year || 'Unknown',
        publisher: 'Unknown'
      }]
    });
    if (saved && cover) saveCoverFor(saved.id, { url: cover }, { quiet: true });
  };

  // Author page: "I own this" opens the usual confirmation card (cover + language) for that book.
  const [scannerInitialBook, setScannerInitialBook] = useState(null);
  const addOwnedFromAuthor = (entry, author) => {
    setScannerInitialBook({
      title: entry.title,
      subtitle: entry.subtitle || null,
      authors: [author.name, ...(entry.coAuthors || [])],
      publishedDate: entry.year,
      language: 'English',
      isbn13: entry.isbn13 || null,
      workKey: entry.workKey || null,
      sources: entry.sources,
      series: entry.series || null,
      seriesNumber: entry.seriesNumber ?? null,
      hardcoverSeriesId: entry.hardcoverSeriesId || null,
      covers: entry.cover ? [{ url: entry.cover.replace(/-M\.jpg$/, '-L.jpg') }] : []
    });
    setIsScanModalOpen(true);
  };

  // Tapping an author's name anywhere opens their page with their full bibliography.
  const navigateToAuthor = (authorName, e) => {
    e?.stopPropagation();
    setAuthorRequest({ name: authorName, at: Date.now() });
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

          {signupMode !== 'closed' && <div className="flex bg-slate-800/80 p-1 rounded-2xl border border-slate-700/60 text-xs font-semibold">
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
          </div>}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authMode === 'register' && hasUsers && signupMode === 'invite' && (
              <div>
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                  Invite Code
                </label>
                <input
                  type="text"
                  required
                  autoCapitalize="characters"
                  autoComplete="off"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="e.g. K7QP-3MZD"
                  className="w-full px-4 py-2.5 bg-slate-800/90 text-sm font-mono tracking-widest text-white placeholder-slate-500 rounded-xl border border-slate-700 focus:outline-none focus:border-orange-500 transition-colors uppercase"
                />
                <p className="text-[10px] text-slate-500 mt-1">Ask the library's owner for a code.</p>
              </div>
            )}
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
    <div className="flex h-screen h-[100dvh] w-full bg-[#fbfbfd] text-slate-900 font-sans antialiased overflow-hidden select-none">
      {/* On phones the sidebar slides in from the left; tapping outside closes it */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-slate-900/40 z-30 md:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* SIDEBAR */}
      <aside
        onClick={(e) => { if (e.target.closest('button') && !e.target.closest('[data-keep-open]')) { setIsSidebarOpen(false); setNavTick(t => t + 1); } }}
        className={`fixed inset-y-0 left-0 z-40 md:static md:z-20 md:translate-x-0 transform transition-transform duration-200 ${
          isSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        } w-64 flex-shrink-0 bg-[#f4f4f7] md:bg-[#f4f4f7]/95 backdrop-blur-2xl border-r border-slate-200/80 flex flex-col justify-between p-4`}
      >
        <div className="space-y-5 overflow-y-auto pr-1 flex-1 min-h-0">
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
              onClick={() => setIsSettingsOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:text-orange-600 bg-slate-50 hover:bg-orange-50 rounded-xl transition-colors border border-slate-200/60"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>

            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:text-red-600 bg-slate-50 hover:bg-red-50 rounded-xl transition-colors border border-slate-200/60"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>

          <SidebarMenu
            active={activeSection}
            onSelect={(key) => { setActiveSection(key); setCurrentPage(1); if (key === 'family') loadFamily(); }}
            counts={{ ...counts, quotes: quoteCount }}
            alerts={{ overdue: overdue.length, inbox: inboxCount, newReleases: newReleases?.releases?.length || 0 }}
            shelves={myShelves}
            activeShelf={activeShelf}
            isFamily={isFamily}
            hidden={prefs.hiddenMenu || []}
          />
        </div>

        <div className="mt-3 flex-shrink-0 bg-white/80 border border-slate-200/80 p-3 rounded-2xl shadow-2xs">
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
        <header className="h-16 border-b border-slate-200/80 bg-[#fbfbfd]/80 backdrop-blur-md px-3 md:px-8 flex items-center justify-between gap-2 md:gap-4 z-10 flex-shrink-0">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="md:hidden w-9 h-9 flex-shrink-0 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="relative flex-1 min-w-0 md:flex-none md:w-96">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); if (activeSection === 'home') setActiveSection('all'); }}
              placeholder="Search your library…"
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

          <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
            <div className="hidden sm:flex bg-slate-100 p-0.5 rounded-xl border border-slate-200">
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
              onClick={() => openManualAdd()}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold shadow-2xs transition-all"
            >
              <Plus className="w-4 h-4 text-orange-500" />
              <span>Add Manually</span>
            </button>

            <button
              onClick={() => { setScannerInitialMode('check'); setIsScanModalOpen(true); }}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold shadow-2xs transition-all"
              title="Do I own this? Scan a book in the shop"
              aria-label="Do I own it?"
            >
              <BadgeCheck className="w-4 h-4 text-emerald-600" />
              <span className="hidden sm:inline">Own it?</span>
            </button>

            <button
              onClick={() => setIsScanModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white rounded-xl text-xs font-semibold shadow-xs transition-all"
            >
              <ScanBarcode className="w-4 h-4" />
              <span className="hidden sm:inline">Scan / Find Book</span>
              <span className="sm:hidden">Add</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-3 md:px-8 py-4 md:py-6">
          {activeSection === 'authors' && (
            <AuthorPage
              books={books}
              libraryAuthors={libraryAuthors}
              request={authorRequest}
              onOpenBook={(book) => { setSelectedBook(book); setActiveEditionIndex(0); }}
              onAddOwned={addOwnedFromAuthor}
              onAddWishlist={addWishlistFromAuthor}
            />
          )}

          {activeSection === 'series' && (
            <UpNext books={books} onOpenBook={(book) => { setSelectedBook(book); setActiveEditionIndex(0); }} />
          )}
          {activeSection === 'series' && <div className="h-4" />}
          {activeSection === 'series' && (
            <SeriesPage
              books={books}
              hardcoverConnected={Boolean(settings?.hardcover?.connected)}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenBook={(book) => { setSelectedBook(book); setActiveEditionIndex(0); }}
              onUpdateBook={updateBook}
              onAddOwned={addOwnedFromAuthor}
              onAddWishlist={addWishlistFromAuthor}
            />
          )}

          {activeSection === 'year' && (
            <MyYearPage books={books} onOpenBook={(book) => { setSelectedBook(book); setActiveEditionIndex(0); }} />
          )}

          {activeSection === 'new' && (
            <NewForYouPage
              data={newReleases}
              onRefresh={loadNewReleases}
              onDismissed={(id) => setNewReleases(prev => (prev ? { ...prev, releases: prev.releases.filter(r => r.id !== id) } : prev))}
              onAddWishlist={async (r) => {
                const saved = await addBook({
                  workTitle: r.title,
                  author: r.author,
                  series: r.series || null,
                  seriesNumber: r.seriesNumber ?? null,
                  hardcoverSeriesId: r.hardcoverSeriesId || null,
                  owned: false,
                  readingStatus: 'Unread',
                  shelfLocation: '',
                  customCoverUrl: r.cover || null,
                  theme: COVER_THEMES[Math.floor(Math.random() * COVER_THEMES.length)],
                  editions: [{ id: `ed-${Date.now()}`, title: r.title, language: 'English', format: 'Physical Print', isbn: r.isbn13 || 'Pending Scan', published: r.date || 'Unknown', publisher: 'Unknown' }]
                });
                if (saved && r.cover) saveCoverFor(saved.id, { url: r.cover }, { quiet: true });
                return saved;
              }}
            />
          )}

          {activeSection === 'family' && isFamily && (
            <FamilyPage family={family} myBooks={books} onOpenSettings={() => setIsSettingsOpen(true)} onRefresh={loadFamily} />
          )}

          {activeSection === 'home' && (
            <HomePage
              key={navTick}
              books={books}
              currentUser={currentUser}
              overdue={overdue}
              inboxCount={inboxCount}
              newCount={newReleases?.releases?.length || 0}
              onOpenBook={(book) => { setSelectedBook(book); setActiveEditionIndex(0); }}
              onGo={(key) => { setActiveSection(key); setCurrentPage(1); }}
              onScan={() => { setScannerInitialMode(null); setIsScanModalOpen(true); }}
              BookCover={(book) => <AppleBookCover book={book} />}
            />
          )}
          {activeSection === 'challenges' && isFamily && <ChallengesPage key={navTick} />}
          {activeSection === 'activity' && (
            <ActivityPage key={navTick} onAddToWishlist={addRefToWishlist} onOpenSettings={() => setIsSettingsOpen(true)} onInboxChange={setInboxCount} />
          )}
          {activeSection === 'discover' && <DiscoverPage key={navTick} onAddToWishlist={addRefToWishlist} />}
          {activeSection === 'clubs' && <ClubsPage key={navTick} myBooks={books} />}
          {activeSection === 'lists' && <ListsPage key={navTick} myBooks={books} onAddToWishlist={addRefToWishlist} />}
          {activeSection === 'readinglog' && <ReadingLogPage key={navTick} isFamily={isFamily} />}
          {activeSection === 'gifts' && isFamily && <GiftsPage key={navTick} />}

          {activeSection === 'quotes' && (
            <QuotesPage books={books} onOpenBook={(book) => { setSelectedBook(book); setActiveEditionIndex(0); }} />
          )}

          {['all', 'lent'].includes(activeSection) && overdue.length > 0 && (
            <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-2xl space-y-2" role="alert">
              <p className="text-xs font-bold text-red-700 flex items-center gap-1.5"><BellRing className="w-4 h-4" /> {overdue.length === 1 ? 'A lent book is overdue' : `${overdue.length} lent books are overdue`}</p>
              <ul className="space-y-1.5">
                {overdue.map(({ book, loan, status }) => (
                  <li key={book.id} className="flex items-center gap-2 text-xs text-slate-700 flex-wrap">
                    <button onClick={() => { setSelectedBook(book); setActiveEditionIndex(0); }} className="font-semibold hover:underline text-left">{book.workTitle}</button>
                    <span className="text-slate-500">with {loan.to} · {loan.dueOn ? `${status.daysLate} day${status.daysLate === 1 ? '' : 's'} late` : `out ${status.daysOut} days`}</span>
                    <button onClick={() => sendReminder(book, loan)} className="ml-auto px-2.5 py-1 rounded-lg bg-white border border-red-200 text-red-700 text-[11px] font-semibold hover:bg-red-50">Send a reminder</button>
                  </li>
                ))}
              </ul>
              {reminderNote && <p className="text-[11px] text-emerald-700">{reminderNote}</p>}
            </div>
          )}

          {!['home', 'authors', 'series', 'year', 'family', 'new', 'challenges', 'quotes', 'activity', 'discover', 'clubs', 'lists', 'readinglog', 'gifts'].includes(activeSection) && (
            <div className="space-y-6">
              <div className="flex items-baseline justify-between">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-slate-900">
                    {activeSection === 'all' && `All Books (${filteredBooks.length})`}
                    {activeSection === 'reading' && 'Currently Reading'}
                    {activeSection === 'unread' && `Want to Read (${filteredBooks.length})`}
                    {activeSection === 'completed' && 'Finished Books'}
                    {activeSection === 'wishlist' && 'Missing / Wishlist'}
                    {activeSection === 'lent' && 'Lent Out'}
                    {activeShelf && `${activeShelf} (${filteredBooks.length})`}
                    {activeSection === 'dnf' && `Did Not Finish (${filteredBooks.length})`}
                  </h2>
                  {activeShelf && (
                    <div className="mt-1.5 flex gap-2">
                      <button onClick={askRenameShelf} className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5">
                        <Pencil className="w-3.5 h-3.5" /> Rename shelf
                      </button>
                      <button onClick={askDeleteShelf} className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-red-50 hover:text-red-600 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5">
                        <Trash2 className="w-3.5 h-3.5" /> Remove shelf
                      </button>
                    </div>
                  )}
                  {activeSection === 'wishlist' && counts.wishlist > 0 && (
                    <div className="mt-2 mb-1"><WishlistAlerts books={books} hasLibrary={Boolean(prefs.libbyLibrary)} onOpenSettings={() => setIsSettingsOpen(true)} /></div>
                  )}
                  {activeSection === 'wishlist' && counts.wishlist > 0 && (
                    <button onClick={() => setIsShoppingListOpen(true)} className="mt-1.5 px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5">
                      <ShoppingBag className="w-3.5 h-3.5" /> Shopping list
                    </button>
                  )}
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

              <SortFilterBar
                books={books}
                sortBy={sortBy}
                onSortChange={changeSort}
                filters={filters}
                onFiltersChange={changeFilters}
              />

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
                      onClick={() => openManualAdd()}
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
                              {book.readingStatus === 'DNF' ? 'Did not finish' : book.readingStatus}
                            </span>
                            {book.readingStatus === 'Reading' && progressOf(book) && (
                              <div className="text-[10px] text-orange-600 font-semibold mt-0.5">
                                {progressOf(book).pct !== null ? `${progressOf(book).pct}%` : `Page ${progressOf(book).page}`}
                              </div>
                            )}
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

            <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-center sm:items-start">
                <div className="w-32 sm:w-40 flex-shrink-0">
                  <div className="relative">
                    <AppleBookCover
                      book={selectedBook}
                      height="h-48 sm:h-56"
                    />
                    {isSavingDetailCover && (
                      <div className="absolute inset-0 rounded-2xl bg-white/70 flex items-center justify-center z-20">
                        <RefreshCw className="w-5 h-5 text-orange-500 animate-spin" />
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setIsDetailCoverPickerOpen(true)}
                    className="mt-2 w-full py-1.5 text-[11px] font-semibold text-orange-600 hover:bg-orange-50 rounded-lg flex items-center justify-center gap-1"
                  >
                    <ImagePlus className="w-3.5 h-3.5" /> Change cover
                  </button>
                </div>

                <div className="flex-1 w-full space-y-3">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 leading-tight">{selectedBook.workTitle}</h3>
                    <button
                      onClick={(e) => navigateToAuthor(selectedBook.author, e)}
                      className="text-sm font-semibold text-orange-600 hover:underline mt-0.5 flex items-center gap-1"
                    >
                      <span>{selectedBook.author}</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                    {(() => {
                      const owners = (family?.members || []).filter(m => m.books.some(b => sameBook(b, selectedBook))).map(m => m.displayName);
                      return owners.length > 0 ? (
                        <p className="mt-1 text-[11px] text-sky-700 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Also on {owners.join(' and ')}'s shelf</p>
                      ) : null;
                    })()}
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
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {['Unread', 'Reading', 'Completed', 'DNF'].map(status => (
                        <button
                          key={status}
                          onClick={() => updateBook(selectedBook.id, statusChanges(selectedBook, status))}
                          className={`py-2 text-xs rounded-xl font-semibold border transition-all ${
                            selectedBook.readingStatus === status
                              ? 'bg-orange-500 text-white border-orange-500 shadow-xs'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {status === 'DNF' ? 'Did not finish' : status}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* The book's boxes, grouped into tabs so the page isn't one long scroll. */}
              <div className="flex bg-slate-100 p-1 rounded-2xl text-xs gap-1 sticky top-0 z-10" role="tablist" aria-label="Book sections">
                {[['reading', 'My Reading'], ['about', 'About'], ['notes', 'Review & Quotes'], ['more', 'Shelves & More']].map(([id, label]) => (
                  <button key={id} role="tab" aria-selected={bookTab === id} onClick={() => setBookTab(id)}
                    className={`flex-1 py-2 rounded-xl font-semibold transition-all ${bookTab === id ? 'bg-white shadow-xs text-orange-600' : 'text-slate-500 hover:text-slate-900'}`}>
                    {label}
                  </button>
                ))}
              </div>

              {bookTab === 'reading' && (
                <>
                  {selectedBook.readingStatus === 'Reading' && <ProgressPanel book={selectedBook} onUpdate={(changes) => updateBook(selectedBook.id, changes)} />}
                  <ReadingPanel book={selectedBook} onUpdate={(changes) => updateBook(selectedBook.id, changes)} />
                  <MoodPanel book={selectedBook} onUpdate={(changes) => updateBook(selectedBook.id, changes)} />
                </>
              )}

              {/* Kept mounted (just hidden) so book info is fetched the first time any book is opened. */}
              <div className={bookTab === 'about' ? 'space-y-6' : 'hidden'}>
                <BookInfoPanel book={selectedBook} onBookSaved={onBookSaved} />

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

              {bookTab === 'notes' && (
                <>
                  <ReviewPanel book={selectedBook} onUpdate={(changes) => updateBook(selectedBook.id, changes)} />
                  <QuotesPanel book={selectedBook} onUpdate={(changes) => updateBook(selectedBook.id, changes)} />
                </>
              )}

              {bookTab === 'more' && (
                <>
                  <ShelvesPanel book={selectedBook} shelves={myShelves} onUpdate={(changes) => updateBook(selectedBook.id, changes)} />
                  {selectedBook.owned !== false && <LendPanel book={selectedBook} fromName={currentUser.displayName} onUpdate={(changes) => updateBook(selectedBook.id, changes)} />}
                  {selectedBook.owned !== false && <CollectorPanel book={selectedBook} onUpdate={(changes) => updateBook(selectedBook.id, changes)} />}
                  <FindItLinks book={selectedBook} prefs={prefs} onUpdate={(changes) => updateBook(selectedBook.id, changes)} />
                  <SharePanel book={selectedBook} />
                </>
              )}
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

              <div className="grid grid-cols-2 gap-3 items-end">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">Language of my copy</label>
                  <select
                    value={manualLanguage}
                    onChange={(e) => setManualLanguage(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 bg-white"
                  >
                    {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  {manualCover && (
                    <img src={manualCover.url || manualCover.imageData} alt="" className="w-8 h-12 object-cover rounded border border-slate-200" />
                  )}
                  <button
                    type="button"
                    disabled={!manualTitle.trim()}
                    onClick={() => setIsManualCoverPickerOpen(true)}
                    className="flex-1 py-2 text-xs font-semibold border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-40 flex items-center justify-center gap-1.5"
                    title={manualTitle.trim() ? '' : 'Enter a title first'}
                  >
                    <ImagePlus className="w-3.5 h-3.5 text-orange-500" />
                    {manualCover ? 'Change cover' : 'Choose cover'}
                  </button>
                </div>
              </div>

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

      {isImportOpen && (
        <ImportModal
          books={books}
          onClose={() => setIsImportOpen(false)}
          onImported={(added) => { setBooks(prev => [...added, ...prev]); loadNewReleases(); }}
        />
      )}

      {isShoppingListOpen && (
        <ShoppingList
          books={books}
          onClose={() => setIsShoppingListOpen(false)}
          onGotIt={(b) => updateBook(b.id, { owned: true, shelfLocation: b.shelfLocation || 'Living Room Shelf' })}
        />
      )}

      {isSettingsOpen && settings && (
        <SettingsModal settings={settings} currentUser={currentUser} prefs={prefs} onPrefsChange={setPrefs} books={books} onBookSaved={onBookSaved} onChange={setSettings} onFamilyChange={loadFamily} onImport={() => setIsImportOpen(true)} onClose={() => setIsSettingsOpen(false)} />
      )}

      {/* COVER PICKERS */}
      {isManualCoverPickerOpen && (
        <CoverPicker
          title={manualTitle.trim()}
          author={manualAuthor.trim()}
          isbn={toIsbn13(manualIsbn) || ''}
          language={manualLanguage}
          onCancel={() => setIsManualCoverPickerOpen(false)}
          onChoose={(choice) => {
            setManualCover(choice);
            setIsManualCoverPickerOpen(false);
            // If no ISBN was typed, use the ISBN of the edition whose cover was picked.
            if (!manualIsbn.trim() && choice.option?.isbn13) setManualIsbn(choice.option.isbn13);
          }}
        />
      )}
      {isDetailCoverPickerOpen && selectedBook && (
        <CoverPicker
          title={selectedBook.workTitle}
          author={(selectedBook.author || '').split(',')[0]}
          isbn={toIsbn13(selectedBook.editions?.[0]?.isbn) || ''}
          workKey={selectedBook.workKey || ''}
          language={selectedBook.editions?.[0]?.language || 'English'}
          onCancel={() => setIsDetailCoverPickerOpen(false)}
          onChoose={async (choice) => {
            setIsDetailCoverPickerOpen(false);
            setIsSavingDetailCover(true);
            await saveCoverFor(selectedBook.id, choice.imageData ? { imageData: choice.imageData } : { url: choice.url });
            setIsSavingDetailCover(false);
          }}
        />
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

      {/* MODAL: ADD A BOOK (scan / type ISBN / find by title) */}
      {isScanModalOpen && (
        <ScannerModal
          books={books}
          coverThemes={COVER_THEMES}
          onClose={() => { setIsScanModalOpen(false); setScannerInitialBook(null); setScannerInitialMode(null); }}
          onAdd={addBook}
          onSaveCover={saveCoverFor}
          initialBook={scannerInitialBook}
          initialMode={scannerInitialMode}
          family={family}
          onManualAdd={openManualAdd}
        />
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

  // Start fresh when the cover changes (e.g. after choosing a new one)
  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
  }, [coverUrl]);

  return (
    <div className={`relative w-full ${height} rounded-2xl overflow-hidden shadow-md group-hover:shadow-xl border border-black/10 bg-slate-900 transition-all duration-300 flex flex-col justify-between`}>
      {coverUrl && !imageError && (
        <img
          src={coverUrl}
          alt={book.workTitle}
          onLoad={(e) => (e.currentTarget.naturalWidth < 10 ? setImageError(true) : setImageLoaded(true))}
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
        {book.rating ? <StarRating value={book.rating} size="sm" /> : null}
        {currentLoan(book) && <p className="text-[10px] font-semibold text-sky-700 truncate">Lent to {currentLoan(book).to}</p>}
        {(book.collector?.signed || book.collector?.firstEdition) && (
          <p className="text-[10px] font-semibold text-amber-700 truncate">{[book.collector.signed && 'Signed', book.collector.firstEdition && '1st edition'].filter(Boolean).join(' · ')}</p>
        )}
        {book.readingStatus === 'Reading' && progressOf(book) && (
          <div className="pt-1" title={progressOf(book).total ? `Page ${progressOf(book).page} of ${progressOf(book).total}` : `Page ${progressOf(book).page}`}>
            {progressOf(book).pct !== null ? (
              <div className="flex items-center gap-1.5">
                <div className="flex-1 h-1.5 rounded-full bg-orange-100 overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full" style={{ width: `${progressOf(book).pct}%` }} />
                </div>
                <span className="text-[10px] font-semibold text-orange-600">{progressOf(book).pct}%</span>
              </div>
            ) : (
              <span className="text-[10px] font-semibold text-orange-600">Page {progressOf(book).page}</span>
            )}
          </div>
        )}
        <div className="flex items-center justify-between pt-1 text-[10px]">
          <span className="text-slate-400 flex items-center gap-1 font-medium">
            <span className={`w-1.5 h-1.5 rounded-full ${book.readingStatus === 'Reading' ? 'bg-orange-500' : book.readingStatus === 'Completed' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            {book.readingStatus === 'DNF' ? 'Did not finish' : book.readingStatus}
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
