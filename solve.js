// csv-reader-speed: a faster drop-in for csv-reader 1.0.0 (make.fun).
// Reads each input {text, header} once, left to right, and returns exactly
// what csv-reader 1.0.0 returns: {columns, rows, errors}.
//
// Strategy: fields are cut out with substring() between separators found by
// indexOf() (C++ speed) instead of being built one character at a time.
// Separator positions ('\n' and '\r') are tracked with monotonic cursors, so
// no scan ever re-reads text. A quoted field takes a fast path when it holds
// no newline, carriage return or doubled quote; anything else is scanned by
// readQuotedSlow. Written from the specification, not copied from the vendor.

/** How a field ended: 0 at a comma, 1 at a line break, 2 at the end of the text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0; // a U+FEFF at the very start is dropped
  let line = 1;

  // Next '\n' / '\r' at or after pos (-1: none left; -2: not yet looked up).
  // pos only moves forward while reading, so each lookup resumes where the
  // last one stopped and the whole text is scanned for each at most once.
  let nlNext = -2;
  let crNext = -2;

  // The record being read: the line it starts on and its index in rows (null: the header).
  let recordLine = 1;
  let recordRow = null;

  function refresh() {
    if (nlNext !== -1 && nlNext < pos) nlNext = text.indexOf('\n', pos);
    if (crNext !== -1 && crNext < pos) crNext = text.indexOf('\r', pos);
  }

  // Reads unquoted characters from pos up to the next comma or line break.
  // A CR not followed by LF is dropped (stray_cr). `prefix` holds string parts
  // already collected for this field (a quoted value before its junk, or the
  // opening quote of an unterminated field); returns {value, ended, added},
  // added counting the characters read here.
  function readUnquoted(prefix) {
    let parts = prefix;
    let added = 0;
    for (;;) {
      refresh();
      const ci = text.indexOf(',', pos);
      let end = n;
      let kind = END;
      if (ci !== -1) { end = ci; kind = COMMA; }
      if (nlNext !== -1 && nlNext < end) { end = nlNext; kind = LINE_BREAK; }
      if (crNext !== -1 && crNext < end) {
        if (kind === LINE_BREAK && crNext === end - 1) {
          // CRLF ends the field; the CR belongs to the line break, not the field.
          if (parts === null) {
            const value = text.substring(pos, crNext);
            pos = end + 1;
            line += 1;
            return { value, ended: LINE_BREAK, added: value.length };
          }
          const seg = text.substring(pos, crNext);
          added += seg.length;
          parts.push(seg);
          pos = end + 1;
          line += 1;
          return { value: parts.join(''), ended: LINE_BREAK, added };
        }
        // A lone CR inside the field: dropped, and the field goes on.
        const seg = text.substring(pos, crNext);
        added += seg.length;
        if (parts === null) parts = [];
        parts.push(seg);
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        pos = crNext + 1;
        crNext = -2;
        continue;
      }
      if (parts === null) {
        const value = text.substring(pos, end);
        if (kind === COMMA) pos = end + 1;
        else if (kind === LINE_BREAK) { pos = end + 1; line += 1; }
        else pos = end;
        return { value, ended: kind, added: value.length };
      }
      const seg = text.substring(pos, end);
      added += seg.length;
      parts.push(seg);
      if (kind === COMMA) pos = end + 1;
      else if (kind === LINE_BREAK) { pos = end + 1; line += 1; }
      else pos = end;
      return { value: parts.join(''), ended: kind, added };
    }
  }

  // What follows a closing quote: a comma, a line break, the end of the text,
  // or junk appended as it stands (quote_junk, when the field ends).
  function afterClose(value) {
    if (pos >= n) return { value, ended: END };
    const c = text.charCodeAt(pos);
    if (c === 44) { pos += 1; return { value, ended: COMMA }; }
    if (c === 10) { pos += 1; line += 1; return { value, ended: LINE_BREAK }; }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; return { value, ended: LINE_BREAK }; }
    const junk = readUnquoted([value]);
    if (junk.added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    return junk;
  }

  // A quoted field whose first quote is not a plain close: no closing quote,
  // a doubled quote, or a newline / CR inside. Scanned once, left to right,
  // in segments split only at quotes and carriage returns.
  function readQuotedSlow(open, openLine) {
    const parts = [];
    let seg = open + 1;
    let p = open + 1;
    let closedAt = -1;
    while (p < n) {
      const c = text.charCodeAt(p);
      if (c === 34) {
        if (text.charCodeAt(p + 1) === 34) {
          parts.push(text.substring(seg, p));
          parts.push('"');
          p += 2;
          seg = p;
          continue;
        }
        parts.push(text.substring(seg, p));
        closedAt = p;
        break;
      }
      if (c === 13) {
        // CRLF and a lone CR inside quotes are each one LF.
        parts.push(text.substring(seg, p));
        parts.push('\n');
        line += 1;
        p += text.charCodeAt(p + 1) === 10 ? 2 : 1;
        seg = p;
        continue;
      }
      if (c === 10) line += 1;
      p += 1;
    }
    if (closedAt === -1) {
      // The quote never closes: it is a literal character, and the text after
      // it is read again as unquoted.
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      return readUnquoted(['"']);
    }
    pos = closedAt + 1;
    return afterClose(parts.join(''));
  }

  // A field that opens with a quote at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    const q = text.indexOf('"', open + 1);
    if (q === -1 || text.charCodeAt(q + 1) === 34) return readQuotedSlow(open, openLine);
    refresh();
    if ((nlNext === -1 || nlNext >= q) && (crNext === -1 || crNext >= q)) {
      // Clean quoted field: no newline, CR or doubled quote inside.
      const value = text.substring(open + 1, q);
      pos = q + 1;
      return afterClose(value);
    }
    return readQuotedSlow(open, openLine);
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) { pos += 1; line += 1; }
      else if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; }
      else break;
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    let ended;
    do {
      if (text.charCodeAt(pos) === 34) {
        quoted = true;
        const f = readQuoted();
        fields.push(f.value);
        ended = f.ended;
      } else {
        quoted = false;
        const f = readUnquoted(null);
        fields.push(f.value);
        ended = f.ended;
      }
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record.
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
