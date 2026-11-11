// ISBN and barcode helpers, shared by the app and the server.
//
// Books carry two kinds of barcode:
//  - ISBN barcodes ("Bookland EAN"): 13 digits starting with 978 or 979. This is the book's ISBN.
//  - Store barcodes (UPC-A): 12 digits. Older mass-market paperbacks put these on the back cover.
//    They identify the product for grocery/drug stores, not the book, so they can't be looked up
//    as an ISBN. The real ISBN is printed on the copyright page, the spine, or a second barcode
//    inside the front cover.

export function cleanCode(raw) {
  return String(raw || '').toUpperCase().replace(/[^0-9X]/g, '');
}

export function isValidIsbn10(code) {
  if (!/^\d{9}[\dX]$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const value = code[i] === 'X' ? 10 : Number(code[i]);
    sum += value * (10 - i);
  }
  return sum % 11 === 0;
}

// Checksum used by EAN-13 (and ISBN-13) and UPC-A barcodes.
function hasValidEanChecksum(code) {
  if (!/^\d+$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop();
  let sum = 0;
  // Weights alternate 3,1,3,1... starting from the digit next to the check digit.
  digits.reverse().forEach((d, i) => { sum += d * (i % 2 === 0 ? 3 : 1); });
  return (10 - (sum % 10)) % 10 === check;
}

export function isValidIsbn13(code) {
  return /^97[89]\d{10}$/.test(code) && hasValidEanChecksum(code);
}

export function isbn10to13(isbn10) {
  const core = '978' + isbn10.slice(0, 9);
  let sum = 0;
  core.split('').forEach((d, i) => { sum += Number(d) * (i % 2 === 0 ? 1 : 3); });
  return core + ((10 - (sum % 10)) % 10);
}

export function isbn13to10(isbn13) {
  if (!isbn13.startsWith('978')) return null; // 979 ISBNs have no 10-digit form
  const core = isbn13.slice(3, 12);
  let sum = 0;
  core.split('').forEach((d, i) => { sum += Number(d) * (10 - i); });
  const check = (11 - (sum % 11)) % 11;
  return core + (check === 10 ? 'X' : String(check));
}

// Works out what kind of code was scanned or typed.
// Returns { kind: 'isbn', isbn13, isbn10 } | { kind: 'upc', code } | { kind: 'invalid', code, reason }
export function classifyCode(raw) {
  const code = cleanCode(raw);
  if (code.length === 10) {
    if (isValidIsbn10(code)) return { kind: 'isbn', isbn13: isbn10to13(code), isbn10: code };
    return {
      kind: 'invalid',
      code,
      reason: 'That isn\'t a valid ISBN — please check for a typo. (If you copied the numbers under the barcode on the back of an older paperback, that\'s a store code, not the ISBN. Look for "ISBN" on the copyright page or spine instead.)'
    };
  }
  if (code.length === 13 && /^97[89]/.test(code)) {
    if (isValidIsbn13(code)) return { kind: 'isbn', isbn13: code, isbn10: isbn13to10(code) };
    return { kind: 'invalid', code, reason: 'That ISBN has a typo — the last digit doesn\'t match. Please check it.' };
  }
  // A 12-digit UPC-A, or the same UPC read as a 13-digit EAN with a leading 0.
  if (code.length === 12 || (code.length === 13 && code.startsWith('0'))) {
    return { kind: 'upc', code: code.length === 13 ? code.slice(1) : code };
  }
  if (code.length === 0) return { kind: 'invalid', code, reason: 'Please enter an ISBN.' };
  return { kind: 'invalid', code, reason: 'That doesn\'t look like an ISBN. ISBNs have 10 or 13 digits (13-digit ones start with 978 or 979).' };
}

// The ISBN-13 for any stored ISBN (10 or 13 digits), or null. Used to spot duplicates.
export function toIsbn13(raw) {
  const result = classifyCode(raw);
  return result.kind === 'isbn' ? result.isbn13 : null;
}
