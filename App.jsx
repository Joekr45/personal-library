import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  BookOpen,
  Search,
  ScanBarcode,
  Library,
  Grid3X3,
  List,
  Plus,
  X,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  LogOut,
  Trash2,
  Pencil,
  Menu,
  Settings,
  BadgeCheck,
  ShoppingBag,
  BellRing
} from 'lucide-react';
import { api } from './src/api.js';
import EditBookModal from './src/EditBookModal.jsx';
import ScannerModal from './src/ScannerModal.jsx';
import CoverPicker from './src/CoverPicker.jsx';
import AuthorPage from './src/AuthorPage.jsx';
import SeriesPage from './src/SeriesPage.jsx';
import SettingsModal from './src/SettingsModal.jsx';
import MyYearPage, { UpNext } from './src/MyYearPage.jsx';
import SortFilterBar, { SORTERS, EMPTY_FILTERS, applyFilters } from './src/SortFilterBar.jsx';
import FamilyPage from './src/FamilyPage.jsx';
import ShoppingList from './src/ShoppingList.jsx';
import { currentLoan } from './src/matching.js';
import ImportModal from './src/ImportModal.jsx';
import NewForYouPage from './src/NewForYouPage.jsx';
import { allShelves, hasTag, renameTag, tagsOf, progressOf, progressLabel } from './src/shelves.js';
import QuotesPage from './src/QuotesPage.jsx';
import ChallengesPage from './src/ChallengesPage.jsx';
import { overdueBooks, reminderText, shareOrCopy } from './src/lending.js';
import ActivityPage from './src/ActivityPage.jsx';
import DiscoverPage from './src/DiscoverPage.jsx';
import ClubsPage from './src/ClubsPage.jsx';
import ListsPage from './src/ListsPage.jsx';
import ReadingLogPage from './src/ReadingLogPage.jsx';
import GiftsPage from './src/GiftsPage.jsx';
import WishlistAlerts from './src/WishlistAlerts.jsx';
import SidebarMenu from './src/SidebarMenu.jsx';
import HomePage from './src/HomePage.jsx';
import TrashModal from './src/TrashModal.jsx';
import DuplicatesModal from './src/DuplicatesModal.jsx';
import BatchBar from './src/BatchBar.jsx';
import BottomBar from './src/BottomBar.jsx';
import ShelfMapPage from './src/ShelfMapPage.jsx';
import { allPlaces } from './src/places.js';
import { byTitle, PAGE_SECTIONS, COVER_THEMES, AppleBookCover, AppleBookCard } from './src/appShared.jsx';
import BookDetailModal from './src/BookDetailModal.jsx';
import ManualAddModal from './src/ManualAddModal.jsx';
import AuthScreen from './src/AuthScreen.jsx';
import { saveSnapshot, loadSnapshot, queueChange, sendPending, pendingChanges, clearOffline, isNetworkError } from './src/offline.js';
import { toIsbn13 } from './shared/isbn.js';

// Fallback background palettes when an image is loading or unavailable
// Alphabetical by title, the way libraries do it: "The", "A" and "An" at the start are ignored
// ("The Pillars of the Earth" is filed under P), and numbers sort naturally (2 before 10).
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
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  // No signal: show the copy of the library kept on this device; changes wait in an outbox.
  const [offline, setOffline] = useState(false);
  const [seriesOffer, setSeriesOffer] = useState(null); // the next book in a series you just finished
  const [pendingCount, setPendingCount] = useState(() => pendingChanges().length);
  const [isDuplicatesOpen, setIsDuplicatesOpen] = useState(false);
  // Selecting several books to change them at once
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const toggleSelected = (id) => setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const stopSelecting = () => { setSelectMode(false); setSelectedIds(new Set()); };
  // "Deleted … Undo" message after a delete
  const [undo, setUndo] = useState(null); // { message, ids }
  const undoTimer = useRef(null);
  const offerUndo = (message, ids) => {
    clearTimeout(undoTimer.current);
    setUndo({ message, ids });
    undoTimer.current = setTimeout(() => setUndo(null), 10000);
  };
  const undoDelete = async () => {
    const ids = undo?.ids || [];
    setUndo(null);
    try {
      const restored = await api.restoreFromTrash(ids);
      setBooks(prev => [...restored, ...prev.filter(b => !ids.includes(b.id))]);
    } catch (err) { handleApiError(err); }
  };
  const applyBatch = async (body) => {
    const ids = [...selectedIds];
    try {
      const res = await api.batchBooks({ ids, ...body });
      if (body.trash) {
        setBooks(prev => prev.filter(b => !ids.includes(b.id)));
        offerUndo(`Deleted ${ids.length} book${ids.length === 1 ? '' : 's'}.`, ids);
        stopSelecting();
      } else {
        const byId = new Map(res.books.map(b => [b.id, b]));
        setBooks(prev => prev.map(b => byId.get(b.id) || b));
      }
    } catch (err) { handleApiError(err); }
  };
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
      .catch((err) => {
        // No connection, but this device has a copy of the library: open that.
        const snap = isNetworkError(err) ? loadSnapshot() : null;
        if (snap?.user) {
          setOffline(true);
          setHasUsers(true);
          setCurrentUser(snap.user);
        } else {
          setAuthError('Could not reach the server. Please refresh the page.');
        }
      })
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
      .then((list) => {
        setOffline(false);
        setBooks(list);
        if (list.length) loadNewReleases(); else setNewReleases({ releases: [], authorsChecked: 0 });
        if (pendingChanges().length) reconnect();
      })
      .catch((err) => {
        const snap = isNetworkError(err) ? loadSnapshot() : null;
        if (snap && snap.user?.id === currentUser.id) {
          setOffline(true);
          setBooks(snap.books || []);
        } else {
          setLibraryError(err.message);
        }
      })
      .finally(() => setIsLibraryLoaded(true));
  }, [currentUser]);

  // Keep a copy of the library on this device for when there's no signal.
  useEffect(() => {
    if (currentUser && isLibraryLoaded) saveSnapshot(currentUser, books);
  }, [books, currentUser, isLibraryLoaded]);

  // Back online: send the changes made offline, then get the latest library from the server.
  const reconnecting = useRef(false);
  const reconnect = async () => {
    if (reconnecting.current) return;
    reconnecting.current = true;
    try {
      await api.getSession();
      const result = await sendPending(api);
      setPendingCount(pendingChanges().length);
      if (result.remaining) return; // dropped again
      const list = await api.listBooks();
      setBooks(list);
      setOffline(false);
      if (result.failed) setSaveError(`${result.failed} change${result.failed === 1 ? '' : 's'} made offline couldn't be saved (the book may have been changed elsewhere).`);
    } catch {
      // still offline
    } finally {
      reconnecting.current = false;
    }
  };
  useEffect(() => {
    if (!offline) return undefined;
    const tryNow = () => reconnect();
    window.addEventListener('online', tryNow);
    const timer = setInterval(tryNow, 20000);
    return () => { window.removeEventListener('online', tryNow); clearInterval(timer); };
  }, [offline]);
  const saveLater = (op) => { queueChange(op); setPendingCount(pendingChanges().length); setOffline(true); };

  // Opening the app from a notification (or a link like /?section=activity) goes to that page.
  const openFromLink = (href) => {
    try {
      const section = new URL(href, window.location.origin).searchParams.get('section');
      if (section && /^[a-z]{2,20}$/.test(section)) { setActiveSection(section); setCurrentPage(1); setSelectedBook(null); }
    } catch { /* ignore */ }
  };
  useEffect(() => {
    if (!currentUser) return undefined;
    if (new URLSearchParams(window.location.search).get('section')) {
      openFromLink(window.location.href);
      window.history.replaceState(null, '', window.location.pathname);
    }
    const onMessage = (e) => { if (e.data?.type === 'open') openFromLink(e.data.url); };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
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
      if (isNetworkError(err)) {
        saveLater({ type: 'create', tempId, book });
        return { ...book, id: tempId };
      }
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
      series: ref.series || null, seriesNumber: ref.seriesNumber ?? null, hardcoverSeriesId: ref.hardcoverSeriesId || null,
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
      // Just finished a book in a series? Offer the next one if it isn't in the library.
      if (changes.readingStatus === 'Completed' && before.readingStatus !== 'Completed' && saved.series) {
        api.seriesNext(bookId).then(r => { if (r.next) setSeriesOffer(r.next); }).catch(() => {});
      }
      return saved;
    } catch (err) {
      if (isNetworkError(err)) {
        saveLater({ type: 'update', id: bookId, changes });
        return { ...before, ...changes };
      }
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
    const title = books.find(b => b.id === bookId)?.workTitle;
    setBooks(prev => prev.filter(b => b.id !== bookId));
    try {
      await api.deleteBook(bookId);
      offerUndo(`Deleted “${title || 'book'}”.`, [bookId]);
    } catch (err) {
      if (isNetworkError(err)) { saveLater({ type: 'delete', id: bookId }); return; }
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
    clearOffline(); // don't leave a copy of the library on a shared device
    window.caches?.delete('personal-library-covers').catch(() => {});
    setPendingCount(0);
    setOffline(false);
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
    return <AuthScreen authDisplayName={authDisplayName} authEmail={authEmail} authError={authError} authMode={authMode} authPassword={authPassword} family={family} handleAuthSubmit={handleAuthSubmit} hasUsers={hasUsers} inviteCode={inviteCode} isAuthSubmitting={isAuthSubmitting} setAuthDisplayName={setAuthDisplayName} setAuthEmail={setAuthEmail} setAuthError={setAuthError} setAuthMode={setAuthMode} setAuthPassword={setAuthPassword} setInviteCode={setInviteCode} setShowPassword={setShowPassword} showPassword={showPassword} signupMode={signupMode} />;
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
            onSelect={(key) => { setActiveSection(key); setCurrentPage(1); stopSelecting(); if (key === 'family') loadFamily(); }}
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

        {offline && (
          <div className="px-3 md:px-8 py-2 bg-amber-100 border-b border-amber-200 text-amber-900 text-xs flex items-center gap-2 flex-shrink-0" role="status">
            <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
            <span className="flex-1">
              <b>No connection.</b> Showing the copy of your library saved on this device.
              {pendingCount > 0 ? ` ${pendingCount} change${pendingCount === 1 ? '' : 's'} will be saved when you're back online.` : ' Changes you make will be saved when you\'re back online.'}
            </span>
            <button onClick={reconnect} className="px-2 py-1 rounded-lg bg-white/70 font-semibold">Try now</button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-3 md:px-8 py-4 md:py-6 pb-24 md:pb-6">
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
          {activeSection === 'places' && (
            <ShelfMapPage
              books={books}
              onOpenBook={(book) => { setSelectedBook(book); setActiveEditionIndex(0); }}
              onUpdateMany={async (changes) => { for (const c of changes) await updateBook(c.book.id, { shelfLocation: c.location }); }}
              renderCover={(book) => <AppleBookCover book={book} />}
            />
          )}
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

          {!PAGE_SECTIONS.includes(activeSection) && (
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

              <div className="flex items-start gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <SortFilterBar
                    books={books}
                    sortBy={sortBy}
                    onSortChange={changeSort}
                    filters={filters}
                    onFiltersChange={changeFilters}
                  />
                </div>
                {filteredBooks.length > 0 && (
                  <button onClick={() => (selectMode ? stopSelecting() : setSelectMode(true))}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border ${selectMode ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>
                    {selectMode ? 'Cancel' : 'Select'}
                  </button>
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
                      selecting={selectMode}
                      selected={selectedIds.has(book.id)}
                      onClick={() => (selectMode ? toggleSelected(book.id) : (setSelectedBook(book), setActiveEditionIndex(0)))}
                      onAuthorClick={(e) => (selectMode ? (e.stopPropagation(), toggleSelected(book.id)) : navigateToAuthor(book.author, e))}
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
                          onClick={() => (selectMode ? toggleSelected(book.id) : (setSelectedBook(book), setActiveEditionIndex(0)))}
                          className={`cursor-pointer transition-colors ${selectedIds.has(book.id) ? 'bg-orange-50' : 'hover:bg-slate-50/80'}`}
                        >
                          <td className="py-3 px-4 font-medium text-slate-900">
                            {selectMode && <input type="checkbox" readOnly checked={selectedIds.has(book.id)} aria-label={`Select ${book.workTitle}`} className="mr-2 accent-orange-500 align-middle" />}
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
                                {progressOf(book).pct !== null ? `${progressOf(book).pct}%` : progressLabel(progressOf(book))}
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
        <BookDetailModal activeEditionIndex={activeEditionIndex} bookTab={bookTab} books={books} currentUser={currentUser} deleteBook={deleteBook} family={family} isSavingDetailCover={isSavingDetailCover} myShelves={myShelves} navigateToAuthor={navigateToAuthor} onBookSaved={onBookSaved} prefs={prefs} selectedBook={selectedBook} setBookTab={setBookTab} setEditingBook={setEditingBook} setIsDetailCoverPickerOpen={setIsDetailCoverPickerOpen} setOwned={setOwned} setSelectedBook={setSelectedBook} updateBook={updateBook} />
      )}

      {/* MODAL: MANUAL ADD FORM */}
      {isManualAddOpen && (
        <ManualAddModal handleManualAddSubmit={handleManualAddSubmit} manualAuthor={manualAuthor} manualCover={manualCover} manualFormat={manualFormat} manualIsbn={manualIsbn} manualLanguage={manualLanguage} manualOwned={manualOwned} manualSeries={manualSeries} manualSeriesNum={manualSeriesNum} manualShelf={manualShelf} manualTitle={manualTitle} setIsManualAddOpen={setIsManualAddOpen} setIsManualCoverPickerOpen={setIsManualCoverPickerOpen} setManualAuthor={setManualAuthor} setManualFormat={setManualFormat} setManualIsbn={setManualIsbn} setManualLanguage={setManualLanguage} setManualOwned={setManualOwned} setManualSeries={setManualSeries} setManualSeriesNum={setManualSeriesNum} setManualShelf={setManualShelf} setManualTitle={setManualTitle} />
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

      {!selectMode && (
        <BottomBar
          active={isSidebarOpen ? 'menu' : activeSection}
          inboxCount={inboxCount}
          onGo={(key) => { setActiveSection(key); setCurrentPage(1); setSelectedBook(null); setNavTick(t => t + 1); }}
          onScan={() => { setScannerInitialMode(null); setIsScanModalOpen(true); }}
          onMenu={() => setIsSidebarOpen(true)}
        />
      )}

      {isTrashOpen && (
        <TrashModal
          onClose={() => setIsTrashOpen(false)}
          onRestored={(restored) => setBooks(prev => [...restored, ...prev.filter(b => !restored.some(r => r.id === b.id))])}
          renderCover={(book) => <AppleBookCover book={book} />}
        />
      )}

      {isDuplicatesOpen && (
        <DuplicatesModal
          books={books}
          onClose={() => setIsDuplicatesOpen(false)}
          onMerged={(book, trashed) => {
            setBooks(prev => prev.filter(b => !trashed.includes(b.id)).map(b => (b.id === book.id ? book : b)));
            offerUndo(`Merged into “${book.workTitle}”. The extra copies are in Recently deleted.`, []);
          }}
          renderCover={(book) => <AppleBookCover book={book} />}
        />
      )}

      {selectMode && !PAGE_SECTIONS.includes(activeSection) && (
        <BatchBar
          count={selectedIds.size}
          total={filteredBooks.length}
          shelves={myShelves}
          onSelectAll={() => setSelectedIds(new Set(filteredBooks.map(b => b.id)))}
          onClear={() => setSelectedIds(new Set())}
          onDone={stopSelecting}
          onApply={applyBatch}
        />
      )}

      {seriesOffer && (
        <div className="fixed bottom-20 md:bottom-4 right-3 md:right-6 z-50 w-[22rem] max-w-[calc(100vw-1.5rem)] p-3 rounded-2xl bg-white border border-slate-200 shadow-2xl flex gap-3" role="dialog" aria-label="Next in the series">
          <div className="w-14 flex-shrink-0">
            {seriesOffer.cover ? <img src={seriesOffer.cover} alt="" className="w-14 rounded-lg shadow" /> : <div className="w-14 h-20 rounded-lg bg-slate-200" />}
          </div>
          <div className="flex-1 min-w-0 text-xs">
            <p className="text-[10px] uppercase font-semibold text-orange-600">Next in {seriesOffer.series}</p>
            <p className="font-bold text-slate-900">#{seriesOffer.seriesNumber}: {seriesOffer.title}</p>
            <p className="text-slate-500">{seriesOffer.author}{seriesOffer.year ? ` · ${seriesOffer.year}` : ''}</p>
            <div className="mt-2 flex gap-2">
              <button onClick={async () => { const offer = seriesOffer; setSeriesOffer(null); const added = await addRefToWishlist(offer); if (added) offerUndo(`Added “${offer.title}” to your wishlist.`, []); }}
                className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-[11px] font-semibold">Add to wishlist</button>
              <button onClick={() => setSeriesOffer(null)} className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-[11px] font-semibold">No thanks</button>
            </div>
          </div>
        </div>
      )}

      {undo && (
        <div className={`fixed ${selectMode ? 'bottom-24' : 'bottom-20 md:bottom-4'} left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-2xl bg-slate-900 text-white text-xs shadow-2xl flex items-center gap-3 ring-1 ring-white/10`} role="status">
          <span>{undo.message}</span>
          {undo.ids.length > 0 && <button onClick={undoDelete} className="font-bold text-orange-400 hover:text-orange-300">Undo</button>}
          <button onClick={() => setUndo(null)} aria-label="Dismiss" className="text-white/60 hover:text-white">✕</button>
        </div>
      )}

      {isSettingsOpen && settings && (
        <SettingsModal settings={settings} currentUser={currentUser} prefs={prefs} onPrefsChange={setPrefs} books={books} onBookSaved={onBookSaved} onChange={setSettings} onFamilyChange={loadFamily} onImport={() => setIsImportOpen(true)} onClose={() => setIsSettingsOpen(false)}
          onOpenTrash={() => { setIsSettingsOpen(false); setIsTrashOpen(true); }}
          onOpenDuplicates={() => { setIsSettingsOpen(false); setIsDuplicatesOpen(true); }} />
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
          places={allPlaces(books)}
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
