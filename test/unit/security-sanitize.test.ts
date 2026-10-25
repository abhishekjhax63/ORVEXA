import { describe, expect, it } from "vitest";

import {
  assertSafeIdentifier,
  escapeHtml,
  hasUnsafeCharacters,
  isSafeHttpUrl,
  normaliseEnum,
  pickAllowedKeys,
  safeFilename,
  sanitiseMultiline,
  sanitiseSingleLine,
  stripTags,
  stripUnsafeCharacters,
  summariseForAudit,
} from "@/lib/security/sanitize";

describe("stripTags", () => {
  it("removes a script tag wrapper but leaves the inner text", () => {
    // This helper removes tags; it does not execute or decode anything.
    expect(stripTags("<script>alert('x')</script>")).toBe("alert('x')");
  });

  it("removes an img tag with an event handler", () => {
    expect(stripTags("<img src=x onerror=alert(1)>hello")).toBe("hello");
  });
});

describe("escapeHtml", () => {
  it("escapes the five characters that matter in HTML", () => {
    expect(escapeHtml(`<img src="x" onerror='alert(1)'>`)).toBe(
      "&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt;",
    );
  });
});

describe("isSafeHttpUrl", () => {
  it("rejects javascript:, data: and vbscript: URLs", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeHttpUrl("vbscript:msgbox(1)")).toBe(false);
  });

  it("accepts http and https URLs", () => {
    expect(isSafeHttpUrl("https://example.com/path?q=1")).toBe(true);
    expect(isSafeHttpUrl("http://example.com")).toBe(true);
  });

  it("rejects a value that is not a URL", () => {
    expect(isSafeHttpUrl("not a url")).toBe(false);
    expect(isSafeHttpUrl("")).toBe(false);
  });
});

describe("stripUnsafeCharacters / hasUnsafeCharacters", () => {
  it("removes control and zero-width characters", () => {
    expect(stripUnsafeCharacters("a\u0000b\u200Bc")).toBe("abc");
  });

  it("detects unsafe characters", () => {
    expect(hasUnsafeCharacters("a\u0000b")).toBe(true);
    expect(hasUnsafeCharacters("safe text")).toBe(false);
  });
});

describe("sanitiseSingleLine", () => {
  it("collapses whitespace and trims, without stripping tags", () => {
    expect(sanitiseSingleLine("  <b>Hi</b>\n\n  there  ")).toBe("<b>Hi</b> there");
  });

  it("truncates to maxLength", () => {
    expect(sanitiseSingleLine("abcdef", 3)).toBe("abc");
  });
});

describe("sanitiseMultiline", () => {
  it("caps consecutive blank lines and trims", () => {
    expect(sanitiseMultiline("a\n\n\n\nb")).toBe("a\n\nb");
  });
});

describe("safeFilename", () => {
  it("strips path separators and traversal from a filename", () => {
    const result = safeFilename("../../etc/passwd");
    expect(result).not.toContain("/");
    expect(result).not.toContain("..");
    expect(result).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it("replaces disallowed characters", () => {
    expect(safeFilename("no extension")).toBe("no_extension");
  });
});

describe("normaliseEnum", () => {
  it("accepts only allowed values", () => {
    expect(normaliseEnum("A", ["A", "B"] as const)).toBe("A");
    expect(normaliseEnum("C", ["A", "B"] as const)).toBeNull();
    expect(normaliseEnum(42, ["A"] as const)).toBeNull();
    expect(normaliseEnum(null, ["A"] as const)).toBeNull();
  });
});

describe("assertSafeIdentifier", () => {
  it("accepts a storage-safe identifier", () => {
    expect(assertSafeIdentifier("order_ORX-PH-7K2M4Q")).toBe("order_ORX-PH-7K2M4Q");
  });

  it("rejects separators, empties and over-long identifiers", () => {
    expect(assertSafeIdentifier("a/b")).toBeNull();
    expect(assertSafeIdentifier("")).toBeNull();
    expect(assertSafeIdentifier("a".repeat(129))).toBeNull();
  });
});

describe("pickAllowedKeys", () => {
  it("copies only explicitly allowed keys (mass-assignment guard)", () => {
    const result = pickAllowedKeys({ email: "a@b.com", status: "ACTIVE" }, ["email"] as const);
    expect(result).toEqual({ email: "a@b.com" });
    expect(result).not.toHaveProperty("status");
  });
});

describe("summariseForAudit", () => {
  it("sanitises and escapes a short audit summary", () => {
    expect(summariseForAudit("<script>alert(1)</script>")).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
