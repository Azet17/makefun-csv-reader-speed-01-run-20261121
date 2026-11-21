// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader), written from
// the RULES.txt semantics: same answers on every input, faster on CPU.
//
// Strategy: never build a field one character at a time. Unquoted fields are
// cut with indexOf(',', '\n') and a slice; quoted fields run indexOf('"') to
// the next quote; only segments that actually hold a CR or LF (inside quotes,
// or a stray CR in an unquoted field) fall back to a short character loop.
// Line counting, BOM drop, empty-line skipping, stray_cr / quote_junk /
// unterminated_quote / short_row / long_row all follow the reference policy.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input: {columns, rows, errors}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (len > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Appends text[a..b) onto `parts`, turning every CRLF and lone CR inside
  // quotes into one LF and counting the lines they span.
  function pushSegment(parts, a, b) {
    const seg = text.slice(a, b);
    if (seg.indexOf('\r') === -1 && seg.indexOf('\n') === -1) {
      parts.push(seg);
      return;
    }
    let start = a;
    for (let i = a; i < b; i++) {
      const cc = text.charCodeAt(i);
      if (cc === 13) {
        if (i > start) parts.push(text.slice(start, i));
        parts.push('\n');
        line += 1;
        if (text.charCodeAt(i + 1) === 10) i += 1;
        start = i + 1;
      } else if (cc === 10) {
        if (i > start) parts.push(text.slice(start, i));
        parts.push('\n');
        line += 1;
        start = i + 1;
      }
    }
    if (b > start) parts.push(text.slice(start, b));
  }

  // Reads an unquoted field starting at pos, with `pre` (pieces already kept,
  // or null) as its start. Returns {value, ended, added}: `added` counts the
  // characters this scan kept (quote_junk is raised when it is > 0 after a
  // closing quote). A CR not followed by LF is dropped (stray_cr).
  function readUnquoted(pre) {
    const iComma = text.indexOf(',', pos);
    const iLF = text.indexOf('\n', pos);
    let end;
    let ended;
    if (iComma === -1) {
      if (iLF === -1) {
        end = len;
        ended = END;
      } else {
        end = iLF;
        ended = LINE_BREAK;
      }
    } else if (iLF === -1) {
      end = iComma;
      ended = COMMA;
    } else if (iComma < iLF) {
      end = iComma;
      ended = COMMA;
    } else {
      end = iLF;
      ended = LINE_BREAK;
    }

    // A CR right before the LF that ends the field is the CRLF line break,
    // not part of the field.
    let bodyEnd = end;
    if (ended === LINE_BREAK && end > pos && text.charCodeAt(end - 1) === 13) bodyEnd = end - 1;

    const body = text.slice(pos, bodyEnd);
    if (body.indexOf('\r') === -1) {
      // Fast path: no stray CR in the field.
      pos = end + (ended === END ? 0 : 1);
      if (ended === LINE_BREAK) line += 1;
      return { value: pre ? pre.join('') + body : body, ended, added: body.length };
    }

    // Slow path: stray CR(s) inside [pos, bodyEnd); every CR there is one,
    // since a CR followed by LF would have ended the field at that LF.
    const parts = pre || [];
    let added = 0;
    let segStart = pos;
    for (let i = pos; i < bodyEnd; i++) {
      if (text.charCodeAt(i) === 13) {
        if (i > segStart) {
          parts.push(text.slice(segStart, i));
          added += i - segStart;
        }
        error('stray_cr');
        segStart = i + 1;
      }
    }
    if (bodyEnd > segStart) {
      parts.push(text.slice(segStart, bodyEnd));
      added += bodyEnd - segStart;
    }
    pos = end + (ended === END ? 0 : 1);
    if (ended === LINE_BREAK) line += 1;
    return { value: parts.join(''), ended, added };
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    const parts = [];
    let p = pos + 1;
    while (true) {
      const q = text.indexOf('"', p);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        line = openLine;
        error('unterminated_quote');
        pos = open + 1;
        return readUnquoted(['"']);
      }
      if (text.charCodeAt(q + 1) === 34) {
        // Doubled quote: one quote inside the field.
        pushSegment(parts, p, q);
        parts.push('"');
        p = q + 2;
        continue;
      }
      pushSegment(parts, p, q);
      pos = q + 1;
      break;
    }
    if (pos >= len) return { value: parts.join(''), ended: END, added: 0 };
    const cc = text.charCodeAt(pos);
    if (cc === 44) {
      pos += 1;
      return { value: parts.join(''), ended: COMMA, added: 0 };
    }
    if (cc === 10) {
      pos += 1;
      line += 1;
      return { value: parts.join(''), ended: LINE_BREAK, added: 0 };
    }
    if (cc === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return { value: parts.join(''), ended: LINE_BREAK, added: 0 };
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    const junk = readUnquoted(parts);
    if (junk.added > 0) error('quote_junk');
    return junk;
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const cc = text.charCodeAt(pos);
      if (cc === 10) {
        pos += 1;
        line += 1;
      } else if (cc === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let field;
    let lastQuoted = false;
    do {
      lastQuoted = text.charCodeAt(pos) === 34;
      field = lastQuoted ? readQuoted() : readUnquoted(null);
      fields.push(field.value);
    } while (field.ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

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
