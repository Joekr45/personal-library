// Where books live. A location can have levels, separated by "/":
// "Living room / Tall bookcase / Shelf 3"  →  room › bookcase › shelf.

export const placeParts = (location) => String(location || '').split(/\s*[/›>]\s*/).map(p => p.trim()).filter(Boolean);
export const placeText = (parts) => parts.join(' / ');

// A tree: { name, path, books (directly here), children: [...], count (here and below) }.
export function placeTree(books) {
  const root = { name: '', path: [], books: [], children: [], count: 0 };
  const unplaced = [];
  for (const b of books) {
    const parts = placeParts(b.shelfLocation);
    if (parts.length === 0) { unplaced.push(b); continue; }
    let node = root;
    root.count++;
    for (let i = 0; i < parts.length; i++) {
      let child = node.children.find(c => c.name.toLowerCase() === parts[i].toLowerCase());
      if (!child) {
        child = { name: parts[i], path: parts.slice(0, i + 1), books: [], children: [], count: 0 };
        node.children.push(child);
      }
      child.count++;
      node = child;
    }
    node.books.push(b);
  }
  const sort = (n) => { n.children.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })); n.children.forEach(sort); };
  sort(root);
  return { rooms: root.children, unplaced };
}

// Every location in use (for suggestions when typing one).
export const allPlaces = (books) => [...new Set(books.map(b => placeText(placeParts(b.shelfLocation))).filter(Boolean))].sort();

// Rename a level for one book: "Living room / Shelf 1" with path ["Living room"] → ["Den"] becomes "Den / Shelf 1".
export function renamePlace(location, oldPath, newPath) {
  const parts = placeParts(location);
  const matches = oldPath.every((p, i) => (parts[i] || '').toLowerCase() === p.toLowerCase());
  return matches ? placeText([...newPath, ...parts.slice(oldPath.length)]) : location;
}
