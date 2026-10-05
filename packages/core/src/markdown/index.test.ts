import { describe, expect, it } from "vitest";

import {
  cleanPasted,
  plainText,
  renderMarkdown,
  safeHref,
  splitSentences,
  titleFromBody,
  wordCount,
} from "./index.ts";

describe("renderMarkdown", () => {
  it("renders headings, paragraphs and emphasis", () => {
    const html = renderMarkdown("# Photosynthesis\n\nUses **light** energy and **_water_**.");
    expect(html).toContain("<h1>Photosynthesis</h1>");
    expect(html).toContain("<strong>light</strong>");
    expect(html).toContain("<em>water</em>");
  });

  it("renders both list shapes", () => {
    const html = renderMarkdown("- one\n- two\n\n1. first\n2. second");
    expect(html).toBe("<ul><li>one</li><li>two</li></ul>\n<ol><li>first</li><li>second</li></ol>");
  });

  it("renders blockquotes and rules", () => {
    const html = renderMarkdown("> remember this\n\n---");
    expect(html).toBe("<blockquote><p>remember this</p></blockquote>\n<hr>");
  });

  it("escapes HTML so pasted markup cannot execute", () => {
    const html = renderMarkdown('<script>alert("x")</script>\n\n<img src=x onerror=y>');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("allows only the four tags the editor inserts", () => {
    const html = renderMarkdown("H<sub>2</sub>O and E = mc<sup>2</sup><br/>");
    expect(html).toContain("<sub>2</sub>");
    expect(html).toContain("<sup>2</sup>");
    expect(html).toContain("<br>");
  });

  it("does not format inside inline code", () => {
    const html = renderMarkdown("`**not bold**`");
    expect(html).toBe("<p><code>**not bold**</code></p>");
  });

  it("keeps fenced code intact and apart from the paragraphs around it", () => {
    const html = renderMarkdown("before\n\n```js\nconst a = 1;\n# not a heading\n```\n\nafter");
    expect(html).toContain("<pre class=\"sq-md-pre\"><code data-lang=\"js\">");
    expect(html).toContain("const a = 1;\n# not a heading");
    expect(html).toContain("<p>before</p>");
    expect(html).toContain("<p>after</p>");
  });

  it("refuses unsafe link targets but keeps the label", () => {
    const html = renderMarkdown("[click](javascript:alert(1)) and [ok](https://example.com)");
    expect(html).not.toContain("javascript:");
    // The unsafe one loses its link and keeps the words; the safe one keeps the anchor.
    expect(html).toContain("click and ");
    expect(html).not.toContain("[click]");
    expect(html).toContain('<a href="https://example.com"');
  });

  it("treats a fenced block at the very start of a note as a block", () => {
    const html = renderMarkdown("```python\nprint(1)\n```");
    expect(html.startsWith("<pre")).toBe(true);
    expect(html).toContain("print(1)");
  });
});

describe("safeHref", () => {
  it("accepts http, mailto and in-app paths", () => {
    expect(safeHref("https://a.example/x")).toBe(true);
    expect(safeHref("http://a.example")).toBe(true);
    expect(safeHref("mailto:someone@school.edu")).toBe(true);
    expect(safeHref("/study/abc")).toBe(true);
    expect(safeHref("#top")).toBe(true);
  });

  it("rejects script and data URLs", () => {
    expect(safeHref("javascript:alert(1)")).toBe(false);
    expect(safeHref("data:text/html,<b>x</b>")).toBe(false);
    expect(safeHref("vbscript:msgbox")).toBe(false);
  });
});

describe("plainText", () => {
  it("strips markdown syntax but keeps the words", () => {
    const text = plainText("# Heading\n\n- first **bold**\n1. second [link](https://x.test)");
    expect(text).toBe("Heading\n\nfirst bold\nsecond link");
  });

  it("keeps tag contents so scientific notation reads aloud", () => {
    expect(plainText("H<sub>2</sub>O releases O<sub>2</sub>")).toBe("H2O releases O2");
  });

  it("keeps code bodies and drops the fence markers", () => {
    const text = plainText("intro\n\n```js\nconst a = 1;\n```\n\noutro");
    expect(text).toBe("intro\n\nconst a = 1;\n\noutro");
  });
});

describe("wordCount", () => {
  it("counts words, not markdown", () => {
    expect(wordCount("# Two words")).toBe(2);
    expect(wordCount("")).toBe(0);
    expect(wordCount("**a** *b* `c` d")).toBe(4);
  });
});

describe("titleFromBody", () => {
  it("takes the first line with words in it", () => {
    expect(titleFromBody("\n\n## Newton's laws\nRest of the note")).toBe("Newton's laws");
  });

  it("falls back rather than showing an empty title", () => {
    expect(titleFromBody("   \n  ")).toBe("Untitled note");
  });

  it("truncates an over-long first line", () => {
    const title = titleFromBody("x".repeat(200));
    expect(title.length).toBeLessThanOrEqual(90);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("cleanPasted", () => {
  it("normalises line endings, nbsp and trailing spaces", () => {
    const out = cleanPasted("a\u00A0b  \r\nc\r\n");
    expect(out).toBe("a b\nc");
  });

  it("promotes an ALL CAPS line that stands alone", () => {
    expect(cleanPasted("intro\n\nPHOTOSYNTHESIS\n\nrest")).toBe("intro\n\n## PHOTOSYNTHESIS\n\nrest");
  });

  it("promotes a short label ending in a colon", () => {
    expect(cleanPasted("The cycle\n\nLight reactions:\nthe detail")).toBe(
      "The cycle\n\n## Light reactions\nthe detail",
    );
  });

  it("leaves prose that merely contains a colon alone", () => {
    expect(cleanPasted("Note: this is a sentence and it carries on for a while longer")).toBe(
      "Note: this is a sentence and it carries on for a while longer",
    );
  });

  it("leaves markdown headings and lists alone", () => {
    expect(cleanPasted("## ALREADY A HEADING\n- ITEM ONE")).toBe("## ALREADY A HEADING\n- ITEM ONE");
  });

  it("collapses runs of blank lines to one", () => {
    expect(cleanPasted("a\n\n\n\nb")).toBe("a\n\nb");
  });
});

describe("splitSentences", () => {
  it("splits on sentence punctuation", () => {
    expect(splitSentences("One. Two! Three?")).toEqual(["One.", "Two!", "Three?"]);
  });

  it("returns nothing for an empty note", () => {
    expect(splitSentences("")).toEqual([]);
  });

  it("chunks a very long sentence so no utterance is oversized", () => {
    const long = `${"word ".repeat(120).trim()}.`;
    const parts = splitSentences(long, 100);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 100)).toBe(true);
    expect(parts.join(" ").replace(/\s+/g, " ")).toBe(long.replace(/\s+/g, " "));
  });
});
