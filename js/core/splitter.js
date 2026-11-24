// Sentence splitter for one paragraph of plain text. Pure function, no DOM, testable with node.
// Rules (owner requests #1 #7 #10 #26 #34):
//  - no break after abbreviations (M., Mme, Dr, etc., cf., p. …) or single letters (C., J. B.)
//  - no break when the next word starts lowercase («  Tu viens ? » demanda-t-il), or after "etc."
//  - no break inside quotes « » „ “ “ ” " " — unless the current chunk is already longer than softMax
//  - closing quotes/brackets stay attached to the sentence they end

export const SPLITTER_VERSION = 1;

const ABBREV = new Set([
  'm', 'mm', 'mme', 'mmes', 'mlle', 'mlles', 'me', 'mes', 'mgr', 'dr', 'pr', 'prof', 'st', 'ste', 'sts',
  'mr', 'mrs', 'ms', 'messrs', 'jr', 'sr', 'cf', 'etc', 'ex', 'p', 'pp', 'vol', 'chap', 'ch', 'fig', 'no', 'nos',
  'n', 'av', 'bd', 'env', 'vs', 'approx', 'dept', 'gén', 'col', 'cdt', 'lt', 'sgt', 'cie', 'inc', 'ltd', 'co',
  'éd', 'ed', 'trad', 'op', 'cit', 'ibid', 'id', 'ps', 'nb',
]);
const TERMINAL = /[.!?…]/;
const CLOSER = /[»”"’)\]›“]/;           // “ closes German „quotes“
const SPACE = /[ \u00a0\u202f\u2009]/;
const LOWER = /[\p{Ll}]/u;
const LETTER = /[\p{L}\p{N}]/u;

function trackQuote(stack, c) {
  const top = stack[stack.length - 1];
  switch (c) {
    case '«': case '‹': case '„': stack.push(c); break;
    case '»': if (top === '«') stack.pop(); break;
    case '›': if (top === '‹') stack.pop(); break;
    case '“': if (top === '„') stack.pop(); else stack.push('“'); break;
    case '”': if (top === '“' || top === '„') stack.pop(); break;
    case '"': if (top === '"') stack.pop(); else stack.push('"'); break;
  }
  if (stack.length > 4) stack.length = 0;  // garbage quoting: give up rather than glue a whole chapter
}

function wordBefore(text, i) {
  let s = i;
  while (s > 0 && /[\p{L}]/u.test(text[s - 1])) s--;
  return text.slice(s, i);
}

export function splitParagraph(text, { softMax = 240 } = {}) {
  const out = [];
  const stack = [];
  const n = text.length;
  let start = 0;

  for (let i = 0; i < n; i++) {
    const c = text[i];
    trackQuote(stack, c);
    if (!TERMINAL.test(c)) continue;

    // Run of terminals ("?!", "...", "…").
    let e = i;
    while (e + 1 < n && TERMINAL.test(text[e + 1])) e++;
    const single = e === i;
    // Closing quotes/brackets, possibly after a (narrow) no-break space: "toujours ! »"
    let k = e + 1;
    for (;;) {
      let s = k;
      while (s < n && SPACE.test(text[s]) && text[s] !== ' ') s++;          // nbsp before closer
      if (s < n && text[s] === ' ' && text[s + 1] === '»') s++;             // plain space before »
      if (s < n && CLOSER.test(text[s]) && !(text[s] === '“' && stack[stack.length - 1] !== '„') && !(text[s] === '"' && stack[stack.length - 1] !== '"')) {
        trackQuote(stack, text[s]);
        k = s + 1;
      } else break;
    }
    i = k - 1;
    if (k >= n) break;                                // paragraph end handled below
    if (!SPACE.test(text[k])) continue;              // "3.14", "U.S.A", "ah!oh"

    let m = k;
    while (m < n && SPACE.test(text[m])) m++;
    if (m >= n) break;
    const next = text[m];

    if (c === '.' && single) {
      const w = wordBefore(text, e);
      if (w.length === 1 || ABBREV.has(w.toLowerCase())) continue;
    }
    if (LOWER.test(next) || /[,;:)\]»”]/.test(next)) continue;
    if (stack.length && k - start < softMax) continue;

    out.push(text.slice(start, k).trim());
    start = m;
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);

  // Glue fragments without any letter (a lone "»" or "—") to the previous sentence.
  const merged = [];
  for (const s of out) {
    if (merged.length && !LETTER.test(s)) merged[merged.length - 1] += ' ' + s;
    else merged.push(s);
  }
  return merged;
}

// Collapse HTML whitespace but keep no-break spaces (French typography: "courir !").
export function normalizeSpace(text) {
  return text.replace(/[ \t\n\r\f\v]+/g, ' ').replace(/^[\s\u00a0\u202f]+|[\s\u00a0\u202f]+$/g, '');
}
