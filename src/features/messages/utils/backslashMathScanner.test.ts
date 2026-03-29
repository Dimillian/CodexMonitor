import { describe, expect, it } from "vitest";
import { normalizeBackslashMathDelimiters } from "./backslashMathScanner";

describe("normalizeBackslashMathDelimiters", () => {
  it("converts inline and block backslash delimiters", () => {
    const input = [
      "Inline: \\(x^2 + y^2\\)",
      "",
      "\\[",
      "\\int_0^1 x^2\\,dx = \\frac{1}{3}",
      "\\]",
    ].join("\n");

    const normalized = normalizeBackslashMathDelimiters(input);

    expect(normalized).toBe([
      "Inline: $x^2 + y^2$",
      "",
      "$$",
      "\\int_0^1 x^2\\,dx = \\frac{1}{3}",
      "$$",
    ].join("\n"));
  });

  it("keeps escaped inline delimiters literal", () => {
    const input = "Literal: \\\\(x\\\\), parsed: \\(z^2\\)";
    const normalized = normalizeBackslashMathDelimiters(input);
    expect(normalized).toBe("Literal: \\\\(x\\\\), parsed: $z^2$");
  });

  it("keeps fenced code blocks unchanged for backtick and tilde fences", () => {
    const input = [
      "```text",
      "\\(inside-backtick\\)",
      "```",
      "~~~text",
      "\\(inside-tilde\\)",
      "~~~",
      "Outside: \\(ok\\)",
    ].join("\n");

    const normalized = normalizeBackslashMathDelimiters(input);

    expect(normalized).toContain("\\(inside-backtick\\)");
    expect(normalized).toContain("\\(inside-tilde\\)");
    expect(normalized).toContain("Outside: $ok$");
  });

  it("keeps container-prefixed fenced code blocks unchanged", () => {
    const input = [
      "> 1. ```text",
      "> 1. \\(inside\\)",
      "> 1. ```",
      "Outside \\(ok\\)",
    ].join("\n");

    const normalized = normalizeBackslashMathDelimiters(input);

    expect(normalized).toContain("\\(inside\\)");
    expect(normalized).toContain("Outside $ok$");
  });

  it("keeps indented code blocks unchanged, including blockquote-indented code", () => {
    const input = [
      "    \\(indented\\)",
      ">     \\(blockquote-indented\\)",
      "Outside \\(ok\\)",
    ].join("\n");

    const normalized = normalizeBackslashMathDelimiters(input);

    expect(normalized).toContain("    \\(indented\\)");
    expect(normalized).toContain(">     \\(blockquote-indented\\)");
    expect(normalized).toContain("Outside $ok$");
  });

  it("keeps inline code unchanged for single and double backtick runs", () => {
    const input = "`\\(x\\)` and ``\\(y\\)`` and \\(z\\)";
    const normalized = normalizeBackslashMathDelimiters(input);
    expect(normalized).toBe("`\\(x\\)` and ``\\(y\\)`` and $z$");
  });

  it("preserves link destinations, plain urls, autolinks, and reference destinations", () => {
    const input = [
      "[wiki](https://en.wikipedia.org/wiki/Function_\\(mathematics\\))",
      "https://example.com/\\(foo\\)",
      "<https://example.com/\\(bar\\)>",
      "[ref]: https://example.com/\\(baz\\)",
      "Inline \\(ok\\)",
    ].join("\n");

    const normalized = normalizeBackslashMathDelimiters(input);

    expect(normalized).toContain("Function_\\(mathematics\\)");
    expect(normalized).toContain("https://example.com/\\(foo\\)");
    expect(normalized).toContain("<https://example.com/\\(bar\\)>");
    expect(normalized).toContain("[ref]: https://example.com/\\(baz\\)");
    expect(normalized).toContain("Inline $ok$");
  });

  it("handles inline adjacency without requiring surrounding whitespace", () => {
    const input = "f\\(x\\) + \\(n\\)th + a\\(x\\)b";
    const normalized = normalizeBackslashMathDelimiters(input);
    expect(normalized).toBe("f$x$ + $n$th + a$x$b");
  });

  it("preserves list and blockquote prefixes when converting block delimiters", () => {
    const input = [
      "- \\[",
      "  x+y",
      "  \\]",
      "",
      "> \\[",
      "> z+w",
      "> \\]",
    ].join("\n");

    const normalized = normalizeBackslashMathDelimiters(input);

    expect(normalized).toBe([
      "  $$",
      "  x+y",
      "  $$",
      "",
      "> $$",
      "> z+w",
      "> $$",
    ].join("\n"));
  });

  it("emits list-content fences (not list-marker fences) for ordered items", () => {
    const input = [
      "1. \\[",
      "   E = mc^2",
      "   \\]",
    ].join("\n");

    const normalized = normalizeBackslashMathDelimiters(input);

    expect(normalized).toBe([
      "   $$",
      "   E = mc^2",
      "   $$",
    ].join("\n"));
  });

  it("is idempotent and keeps unbalanced delimiters literal", () => {
    const input = [
      "Start \\(x^2",
      "\\[",
      "no closer",
      "Balanced \\(z\\)",
    ].join("\n");

    const once = normalizeBackslashMathDelimiters(input);
    const twice = normalizeBackslashMathDelimiters(once);

    expect(once).toContain("Start \\(x^2");
    expect(once).toContain("\\[");
    expect(once).toContain("Balanced $z$");
    expect(twice).toBe(once);
  });
});

describe("normalizeBackslashMathDelimiters extraction-shaped coverage", () => {
  it("converts mixed inline and display spans", () => {
    const input = [
      String.raw`inline \(x^2 + 3\)`,
      String.raw`\[`,
      String.raw`\int_a^b f(x) \\, dx`,
      String.raw`\]`,
    ].join("\n");
    const normalized = normalizeBackslashMathDelimiters(input);
    expect(normalized).toBe([
      String.raw`inline $x^2 + 3$`,
      "$$",
      String.raw`\int_a^b f(x) \\, dx`,
      "$$",
    ].join("\n"));
  });

  it("ignores delimiters inside inline code and fenced code", () => {
    const input = [
      "`\\(x\\)` and ``\\(y\\)``",
      "```",
      "\\(inside-fence\\)",
      "```",
      "Outside \\(ok\\)",
    ].join("\n");

    const normalized = normalizeBackslashMathDelimiters(input);
    expect(normalized).toContain("`\\(x\\)` and ``\\(y\\)``");
    expect(normalized).toContain("\\(inside-fence\\)");
    expect(normalized).toContain("Outside $ok$");
  });

  it("ignores delimiters inside container-prefixed fences", () => {
    const input = [
      "> > ```",
      "> > \\(inside\\)",
      "> > ```",
      "outside \\(ok\\)",
    ].join("\n");

    const normalized = normalizeBackslashMathDelimiters(input);
    expect(normalized).toContain("> > \\(inside\\)");
    expect(normalized).toContain("outside $ok$");
  });

  it("keeps escaped delimiters literal and converts unescaped ones", () => {
    const input = String.raw`Escaped \\(x\\) and \\[ y \\], real \(z\)`;
    const normalized = normalizeBackslashMathDelimiters(input);
    expect(normalized).toContain(String.raw`\\(x\\)`);
    expect(normalized).toContain(String.raw`\\[ y \\]`);
    expect(normalized).toContain("real $z$");
  });

  it("converts math inside lists and blockquotes", () => {
    const input = [
      String.raw`1. ordered \(a+b=c\)`,
      String.raw`> \[`,
      String.raw`> E = mc^2`,
      String.raw`> \]`,
    ].join("\n");
    const normalized = normalizeBackslashMathDelimiters(input);
    expect(normalized).toContain("1. ordered $a+b=c$");
    expect(normalized).toContain("> $$");
    expect(normalized).toContain("> E = mc^2");
  });

  it("converts alphanumeric-adjacent inline math", () => {
    const input = String.raw`function\(f(x)\)returns\(42\)now`;
    const normalized = normalizeBackslashMathDelimiters(input);
    expect(normalized).toBe("function$f(x)$returns$42$now");
  });

  it("converts multiline display math", () => {
    const input = String.raw`\[
\int_0^1 x^2 \, dx = \frac{1}{3}
\]`;
    const normalized = normalizeBackslashMathDelimiters(input);
    expect(normalized).toBe(["$$", String.raw`\int_0^1 x^2 \, dx = \frac{1}{3}`, "$$"].join("\n"));
  });

  it("preserves link destinations/autolinks/reference urls while allowing visible text conversion", () => {
    const input = String.raw`[See \(x^2\) here](https://example.com)
<https://example.com/\(math\)>
[ref]: https://example.com with \(math\)
outside \(ok\)`;
    const normalized = normalizeBackslashMathDelimiters(input);
    expect(normalized).toContain("[See $x^2$ here](https://example.com)");
    expect(normalized).toContain(String.raw`<https://example.com/\(math\)>`);
    expect(normalized).toContain("[ref]: https://example.com");
    expect(normalized).toContain("outside $ok$");
  });

  it("keeps unbalanced openers literal while still converting later balanced delimiters", () => {
    const input = String.raw`Unbalanced \( x + 3
[refdef]: value with \[ y \]
Normal balanced:
\[
z^2
\]`;
    const normalized = normalizeBackslashMathDelimiters(input);
    expect(normalized).toContain(String.raw`Unbalanced \( x + 3`);
    expect(normalized).toContain(String.raw`[refdef]: value with \[ y \]`);
    expect(normalized).toContain("Normal balanced:");
    expect(normalized).toContain(["$$", "z^2", "$$"].join("\n"));
  });

  it("does not leak internal mask placeholders", () => {
    const input = [
      "Inline \\(x\\)",
      "[wiki](https://example.com/\\(safe\\))",
      "`\\(nope\\)`",
    ].join("\n");

    const normalized = normalizeBackslashMathDelimiters(input);
    expect(normalized).toContain("Inline $x$");
    expect(normalized).not.toContain("CODEXBACKSLASH");
  });
});
