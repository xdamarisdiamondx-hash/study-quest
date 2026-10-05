/**
 * Markdown for notes (P5) — a small, safe subset.
 *
 * Why not a library: notes are the one place a student pastes arbitrary text, and the app
 * renders it back. Escaping first and then re-allowing four known inline tags keeps the
 * output safe by construction (ADR-010 — contracts and pure logic live in `@sq/core` and are
 * unit-tested without a browser or a database).
 *
 * Supported: ATX headings, paragraphs, fenced code, inline code, bold, italic, strikethrough,
 * links, ordered/unordered lists, blockquotes, horizontal rules, and the `<sub>`/`<sup>`/
 * `<mark>`/`<br>` tags the editor's scientific-notation helpers insert.
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** The only HTML tags that survive escaping — everything else stays inert text. */
const SAFE_TAGS = ["sub", "sup", "mark", "br"] as const;

/**
 * Fence markers sit in the Unicode private-use area, so a student typing "FENCE0" in a note
 * can never be mistaken for a code block that is being held aside.
 */
const MARK = "\uE000";

export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);
}

/**
 * Un-escape the four tags we deliberately allow, in both `<tag>` and `<tag/>` spellings.
 * Everything else remains escaped, so a pasted `<script>` can never execute.
 */
function allowSafeTags(escaped: string): string {
  return escaped.replace(
    new RegExp(`&lt;(/?)(${SAFE_TAGS.join("|")})(\\s*/?)&gt;`, "gi"),
    (_m, slash: string, tag: string) => (tag === "br" ? "<br>" : `<${slash}${tag}>`),
  );
}

interface Fences {
  /** The body with each fenced block replaced by a private-use marker on its own line. */
  text: string;
  /** Rendered `<pre>` HTML for each marker, index-matched. */
  blocks: string[];
  /** Raw code for each marker, used when producing plain text. */
  bodies: string[];
}

function extractFences(src: string): Fences {
  const blocks: string[] = [];
  const bodies: string[] = [];

  const text = src.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_m, lang: string, body: string) => {
    const code = body.replace(/\n$/, "");
    const index = bodies.push(code) - 1;
    const langAttr = lang.trim() ? ` data-lang="${escapeHtml(lang.trim())}"` : "";
    blocks.push(`<pre class="sq-md-pre"><code${langAttr}>${escapeHtml(code)}</code></pre>`);
    return `\n${MARK}${index}${MARK}\n`;
  });

  return { text, blocks, bodies };
}

const FENCE_LINE = new RegExp(`^${MARK}(\\d+)${MARK}$`);

/** Inline formatting. Escapes first, so it can only ever emit the tags we choose to emit. */
function inline(raw: string): string {
  let out = escapeHtml(raw);

  // Inline code first: its contents must not be re-interpreted.
  const codes: string[] = [];
  out = out.replace(/`([^`\n]+)`/g, (_m, body: string) => {
    codes.push(`<code>${body}</code>`);
    return `${MARK}C${codes.length - 1}${MARK}`;
  });

  out = allowSafeTags(out);
  out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
  out = out.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");

  // The href may contain balanced parentheses — `javascript:alert(1)` must still be seen
  // whole, otherwise the parser stops at the first `)` and leaves a stray one in the text.
  out = out.replace(
    /\[([^\]\n]+)\]\(([^()\s]*(?:\([^()\s]*\)[^()\s]*)*)\)/g,
    (_m, label: string, href: string) => {
      if (!safeHref(href)) return label;
      return `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${label}</a>`;
    },
  );

  // A literal backslash escapes the next markdown character.
  out = out.replace(/\\([*_~[\]`#])/g, "$1");

  out = out.replace(new RegExp(`${MARK}C(\\d+)${MARK}`, "g"), (_m, i: string) => codes[Number(i)] ?? "");
  return out;
}

/** Only web URLs, mailto and in-app paths become links — `javascript:` never does. */
export function safeHref(href: string): boolean {
  const value = href.trim();
  if (/^(https?:|mailto:)/i.test(value)) return true;
  if (/^[/#]/.test(value)) return true;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(value)) return true;
  return false;
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const HR = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const UL_ITEM = /^ {0,3}[-*+]\s+(.*)$/;
const OL_ITEM = /^ {0,3}\d+[.)]\s+(.*)$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;

/** Render a markdown note to HTML. Pure: same input, same output, no side effects. */
export function renderMarkdown(src: string): string {
  const { text, blocks } = extractFences(src.replace(/\r\n?/g, "\n"));
  const lines = text.split("\n");
  const out: string[] = [];
  const paragraph: string[] = [];
  let i = 0;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    out.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph.length = 0;
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (line.trim() === "") {
      flushParagraph();
      i += 1;
      continue;
    }

    const fence = FENCE_LINE.exec(line.trim());
    if (fence) {
      flushParagraph();
      out.push(blocks[Number(fence[1])] ?? "");
      i += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      const level = Math.min(6, (heading[1] ?? "#").length);
      out.push(`<h${level}>${inline(heading[2] ?? "")}</h${level}>`);
      i += 1;
      continue;
    }

    if (HR.test(line.trim())) {
      flushParagraph();
      out.push("<hr>");
      i += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      flushParagraph();
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i] ?? "")) {
        quoted.push(QUOTE.exec(lines[i] ?? "")?.[1] ?? "");
        i += 1;
      }
      out.push(`<blockquote>${renderMarkdown(quoted.join("\n"))}</blockquote>`);
      continue;
    }

    if (UL_ITEM.test(line)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length && UL_ITEM.test(lines[i] ?? "")) {
        items.push(`<li>${inline(UL_ITEM.exec(lines[i] ?? "")?.[1] ?? "")}</li>`);
        i += 1;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (OL_ITEM.test(line)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length && OL_ITEM.test(lines[i] ?? "")) {
        items.push(`<li>${inline(OL_ITEM.exec(lines[i] ?? "")?.[1] ?? "")}</li>`);
        i += 1;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    paragraph.push(line.trim());
    i += 1;
  }

  flushParagraph();
  return out.join("\n");
}

/* --- plain text derivations -------------------------------------------- */

/**
 * The note body as readable text: syntax removed, tag contents kept.
 *
 * Used for word count, for the words the student hears read aloud, and for the text that
 * goes into a prompt — a model should never see markdown markers it has to guess around.
 */
export function plainText(src: string): string {
  const { text, bodies } = extractFences(src.replace(/\r\n?/g, "\n"));

  const stripped = text
    .replace(/^ {0,3}#{1,6}\s+/gm, "")
    .replace(/^ {0,3}[-*+]\s+/gm, "")
    .replace(/^ {0,3}\d+[.)]\s+/gm, "")
    .replace(/^ {0,3}>\s?/gm, "")
    .replace(/\*\*|__|~~|`/g, "")
    .replace(/\[([^\]\n]+)\]\(([^()\n]*(?:\([^()\n]*\)[^()\n]*)*)\)/g, "$1")
    .replace(/<\/?(?:sub|sup|mark|br)\s*>/gi, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();

  // Code goes back in last, so none of the marker-stripping above can touch it.
  return stripped.replace(new RegExp(`${MARK}(\\d+)${MARK}`, "g"), (_m, i: string) => bodies[Number(i)] ?? "");
}

export function wordCount(src: string): number {
  const text = plainText(src);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

/** A title from the first line that has words in it, so a note is never "Untitled 7". */
export function titleFromBody(src: string, max = 90): string {
  for (const raw of plainText(src).split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
  }
  return "Untitled note";
}

/* --- paste cleanup (P5) -------------------------------------------------- */

/**
 * Tidy pasted text without changing what it means.
 *
 * Three rules, all visible by eye:
 *  1. normalise line endings, non-breaking spaces and stray zero-width characters;
 *  2. drop trailing spaces and collapse runs of blank lines;
 *  3. promote obvious headings — an ALL-CAPS line or a short `Sentence:` label that stands
 *     alone becomes a markdown heading, which is what "detect headings" has to mean when
 *     the source is plain text.
 */
export function cleanPasted(src: string): string {
  const normalised = src
    .replace(/\r\n?/g, "\n")
    .replace(/\uFEFF/g, "")
    .replace(/[\u200B-\u200D]/g, "")
    .replace(/\u00A0/g, " ");

  const lines = normalised.split("\n").map((line) => line.replace(/[ \t]+$/, ""));
  const out: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "") {
      if (out.length > 0 && (out[out.length - 1] ?? "").trim() !== "") out.push("");
      continue;
    }

    const previousBlank = out.length === 0 || (out[out.length - 1] ?? "").trim() === "";
    if (previousBlank && isHeadingLike(trimmed) && !HEADING.test(trimmed)) {
      out.push(`## ${trimmed.replace(/:$/, "")}`);
      continue;
    }

    out.push(line);
  }

  while (out.length > 0 && (out[out.length - 1] ?? "").trim() === "") out.pop();
  return out.join("\n");
}

/** ALL CAPS or a short label ending in ":" — the two shapes people use for headings. */
function isHeadingLike(line: string): boolean {
  if (line.length > 60) return false;
  if (/^[-*+#]/.test(line)) return false;
  if (/[:;]\s*\S/.test(line)) return false; // an inline "note: text" is prose, not a heading
  const letters = line.replace(/[^A-Za-z]/g, "");
  if (letters.length === 0) return false;
  if (letters === letters.toUpperCase()) return true;
  return /:$/.test(line) && line.split(/\s+/).length <= 8;
}

/* --- reading aloud (P5 action bar, P10 grows from it) ------------------- */

/**
 * Split text into speakable chunks, one utterance each, so the browser's speech API can
 * pause between sentences and the UI can highlight what is being read.
 */
export function splitSentences(src: string, maxChars = 220): string[] {
  const text = plainText(src).replace(/\n+/g, " ").trim();
  if (!text) return [];

  const rough = text.match(/[^.!?]+[.!?]*["')\]]*\s*|.+$/g) ?? [text];
  const sentences: string[] = [];

  for (const piece of rough) {
    const trimmed = piece.trim();
    if (!trimmed) continue;
    if (trimmed.length <= maxChars) {
      sentences.push(trimmed);
      continue;
    }
    // A paragraph with no punctuation: fall back to clause-length chunks.
    let remaining = trimmed;
    while (remaining.length > maxChars) {
      const cut = remaining.lastIndexOf(" ", maxChars);
      const at = cut > maxChars * 0.6 ? cut : maxChars;
      sentences.push(remaining.slice(0, at).trim());
      remaining = remaining.slice(at).trim();
    }
    if (remaining) sentences.push(remaining);
  }

  return sentences;
}
