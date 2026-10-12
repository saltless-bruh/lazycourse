// Fetched documentation → plain text for skill references (spec §7).
export const MAX_REF_CHARS = 120_000;

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };

function entity(match: string, code: string): string {
  if (code[0] === "#") {
    const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(n) ? String.fromCodePoint(n) : match;
  }
  return NAMED[code.toLowerCase()] ?? match;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|nav|footer)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<head\b[\s\S]*?<\/head\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|pre|tr|dd|dt|table|ul|ol|section)\s*>/gi, "\n")
    .replace(/<h([1-6])\b[^>]*>/gi, (_m, n: string) => "\n" + "#".repeat(Number(n)) + " ")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, entity)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function toText(body: string, url: string, contentType = ""): string {
  const html = /html/i.test(contentType) || /\.html?(?:$|[?#])/i.test(url) || /^\s*<(?:!doctype|html)\b/i.test(body);
  return html ? htmlToText(body) : body.trim();
}

export function cap(text: string, max = MAX_REF_CHARS): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n\n[truncated: ${text.length - max} more characters at the source]`;
}
