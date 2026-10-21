// ai-text-hygiene -- clean up invisible AI text artifacts. Zero dependencies.
//
// Large-language-model output routinely carries invisible/format Unicode
// (zero-width spaces, BOM, bidi controls) and typographic "AI tells" (em dashes,
// curly quotes, the ellipsis character) that make text look machine-made and can
// break ATS keyword parsing, a clean copy-paste, or a plain-text pipeline. This
// module folds that back to plain, human-looking text.
//
// This is DOCUMENT HYGIENE -- clean, human-sounding, parseable output. It is NOT
// an "AI-detection evasion" tool: stripping invisible characters does not defeat a
// statistical or cadence-based watermark, and this library never claims it does.
// See the README for what it does and does not do.
//
// Credit: the invisible/format codepoint inventory was seeded by
// guillaumemeyer/watermarks-remover (MIT). See the NOTICE file.
//
// Design rules:
//  - Idempotent. Every transform is a fixed point; running twice == running once.
//  - Length-stable conservative preset. cleanConservative only strips (shrinks) or
//    does 1:1 swaps, for length-sensitive fields (fixed-width slots, form limits).
//  - Protected spans stay byte-exact. URLs, emails, markdown link targets and
//    inline `code` are never touched by the prose transforms. Universal cleanup
//    (invisibles / spaces / newlines) is safe everywhere.
//  - English house-style only. Curly-quote / dash folding targets English output;
//    for other languages use stripInvisible (or cleanText with those flags off).
//  - Homoglyph folding is OFF by default. Folding Cyrillic/Greek look-alikes would
//    mangle a legitimately non-Latin name, so it is opt-in (foldHomoglyphs flag)
//    and, when enabled, still protected from URLs/emails/code.
//
// Pure ASCII source: every non-ASCII codepoint is built via String.fromCharCode
// from an explicit number, so a literal zero-width or bidi character can never hide
// in this file (which would be ironic, given what it removes).

const chr = (cp) => String.fromCharCode(cp);
function range(a, b) { let s = ''; for (let c = a; c <= b; c++) s += String.fromCharCode(c); return s; }

// Invisible / format characters to STRIP: C0 controls except tab/LF/CR, soft
// hyphen, combining grapheme joiner, arabic letter mark, hangul fillers, khmer
// inherent vowels, mongolian FVS + vowel separator, zero-width chars, bidi
// controls, word joiner + invisible math operators, bidi isolates + deprecated
// format chars, BOM, variation selectors, interlinear annotation.
const STRIP_CHARS =
  range(0x00, 0x08) + chr(0x0B) + chr(0x0C) + range(0x0E, 0x1F) +
  chr(0x00AD) + chr(0x034F) + chr(0x061C) + chr(0x115F) + chr(0x1160) +
  chr(0x17B4) + chr(0x17B5) + range(0x180B, 0x180E) + range(0x200B, 0x200F) +
  range(0x202A, 0x202E) + range(0x2060, 0x2064) + range(0x2066, 0x206F) +
  chr(0xFEFF) + range(0xFE00, 0xFE0F) + range(0xFFF9, 0xFFFB);
const STRIP_RE = new RegExp('[' + STRIP_CHARS + ']', 'g');

// Unicode spaces -> a plain ASCII space (1:1, length-neutral).
const SPACE_CHARS = chr(0x00A0) + chr(0x1680) + range(0x2000, 0x200A) + chr(0x202F) + chr(0x205F) + chr(0x3000);
const SPACE_RE = new RegExp('[' + SPACE_CHARS + ']', 'g');

const LS = chr(0x2028), PS = chr(0x2029);
function normalizeNewlines(s) {
  return s.replace(/\r\n|\r/g, '\n').split(LS).join('\n').split(PS).join('\n');
}

const EM_DASH = chr(0x2014), EN_DASH = chr(0x2013), HELLIP = chr(0x2026);
const LSQUO = chr(0x2018), RSQUO = chr(0x2019), LDQUO = chr(0x201C), RDQUO = chr(0x201D);
const EM_SPACED_RE = new RegExp('\\s+' + EM_DASH + '\\s+', 'g');
const EM_BARE_RE = new RegExp(EM_DASH, 'g');
const EN_RE = new RegExp(EN_DASH, 'g');
const SQUO_RE = new RegExp('[' + LSQUO + RSQUO + ']', 'g');
const DQUO_RE = new RegExp('[' + LDQUO + RDQUO + ']', 'g');
const HELLIP_RE = new RegExp(HELLIP, 'g');

// Curated, unambiguous Cyrillic/Greek -> Latin. Ambiguous lowercase Greek
// (alpha, nu, rho) is excluded to avoid corrupting math/science notation.
const HOMO_PAIRS = [
  [0x0410, 'A'], [0x0412, 'B'], [0x0415, 'E'], [0x041A, 'K'], [0x041C, 'M'], [0x041D, 'H'],
  [0x041E, 'O'], [0x0420, 'P'], [0x0421, 'C'], [0x0422, 'T'], [0x0425, 'X'], [0x0405, 'S'],
  [0x0406, 'I'], [0x0408, 'J'],
  [0x0430, 'a'], [0x0435, 'e'], [0x043E, 'o'], [0x0440, 'p'], [0x0441, 'c'], [0x0443, 'y'],
  [0x0445, 'x'], [0x0455, 's'], [0x0456, 'i'], [0x0458, 'j'],
  [0x0391, 'A'], [0x0392, 'B'], [0x0395, 'E'], [0x0396, 'Z'], [0x0397, 'H'], [0x0399, 'I'],
  [0x039A, 'K'], [0x039C, 'M'], [0x039D, 'N'], [0x039F, 'O'], [0x03A1, 'P'], [0x03A4, 'T'],
  [0x03A5, 'Y'], [0x03A7, 'X'], [0x03BF, 'o'],
];
const HOMOGLYPHS = {};
for (const [cp, to] of HOMO_PAIRS) HOMOGLYPHS[chr(cp)] = to;
const HOMOGLYPH_RE = new RegExp('[' + Object.keys(HOMOGLYPHS).join('') + ']', 'g');

// Spans kept byte-exact even inside prose: inline code, md link targets, URLs, emails.
const PROTECT_RE = /(`[^`\n]*`|\]\([^)\n]*\)|https?:\/\/[^\s)]+|[^\s@]+@[^\s@]+\.[A-Za-z]{2,})/g;

function applyProse(seg, o) {
  let t = seg;
  if (o.emDash) t = t.replace(EM_SPACED_RE, ', ').replace(EM_BARE_RE, ', ');
  if (o.doubleHyphen) t = t.replace(/(?<=\S)[ \t]*-{2,}[ \t]*(?=\S)/g, ', ');
  if (o.enDash) t = t.replace(EN_RE, '-');
  if (o.curlyQuotes) t = t.replace(SQUO_RE, "'").replace(DQUO_RE, '"');
  if (o.ellipsis) t = t.replace(HELLIP_RE, '...');
  if (o.foldHomoglyphs) t = t.replace(HOMOGLYPH_RE, (ch2) => HOMOGLYPHS[ch2] || ch2);
  if (o.collapseSpaces) t = t.replace(/[ \t]+,/g, ',').replace(/,[ \t]*(?:,[ \t]*)+/g, ', ');
  return t;
}

export const DEFAULTS = {
  stripInvisible: true,
  normalizeSpaces: true,
  normalizeNewlines: true,
  curlyQuotes: false,
  emDash: false,
  doubleHyphen: false,
  enDash: false,
  ellipsis: false,
  foldHomoglyphs: false,
  collapseSpaces: true,
};

// The one engine. null/undefined pass through unchanged. Universal flags apply to
// the whole string; prose flags apply only to the unprotected gaps.
export function cleanText(s, opts = {}) {
  if (s == null) return s;
  const o = { ...DEFAULTS, ...opts };
  let t = String(s);
  if (o.normalizeNewlines) t = normalizeNewlines(t);
  if (o.stripInvisible) t = t.replace(STRIP_RE, '');
  if (o.normalizeSpaces) t = t.replace(SPACE_RE, ' ');
  const runsProse =
    o.curlyQuotes || o.emDash || o.doubleHyphen || o.enDash || o.ellipsis || o.foldHomoglyphs || o.collapseSpaces;
  if (!runsProse) return t;
  const parts = t.split(PROTECT_RE);
  for (let i = 0; i < parts.length; i += 2) parts[i] = applyProse(parts[i], o);
  return parts.join('');
}

// stripInvisible(s): always-safe tier only (invisibles + Unicode spaces + newline
// normalization). No punctuation changes. Safe for any language.
export function stripInvisible(s) {
  return cleanText(s, {
    curlyQuotes: false, emDash: false, doubleHyphen: false, enDash: false,
    ellipsis: false, foldHomoglyphs: false, collapseSpaces: false,
  });
}

// clean(s): full English house-style clean. Universal + curly->straight +
// em-dash/"--"->", " + ellipsis->"...". The sensible default for prose.
export function clean(s) {
  return cleanText(s, { curlyQuotes: true, emDash: true, doubleHyphen: true, ellipsis: true, collapseSpaces: true });
}

// cleanConservative(s): length-stable. Strip invisibles (shrinks) + nbsp->space +
// curly->straight (both 1:1). No length-growing transforms and no homoglyph fold,
// for fixed-width fields and character-capped inputs.
export function cleanConservative(s) {
  return cleanText(s, {
    curlyQuotes: true, emDash: false, doubleHyphen: false, enDash: false,
    ellipsis: false, foldHomoglyphs: false, collapseSpaces: false,
  });
}

// Cadence: cleaning is the cosmetic half; the real "AI tell" is rhythm (every
// sentence the same length and shape). analyzeCadence measures it and flags
// monotony; it is a writing-quality signal, not a detector. See cadence.mjs.
export { analyzeCadence, formatCadenceReport } from './cadence.mjs';

// Style: the non-rhythm AI tells (overused vocab, filler, cliche openers, bullet
// overload). analyzeStyle flags them (detect-only); stripRedundantFiller is the
// one safe auto-fix. See style.mjs.
export { analyzeStyle, formatStyleReport, stripRedundantFiller } from './style.mjs';
