// Structured model calls for the suggester and the scaffold (spec §6): JSON out, one corrective retry.
export type Complete = (system: string, user: string) => Promise<string>;

/** The outermost {...} in the reply, so code fences and chatter around it are ignored. */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in the reply");
  return JSON.parse(text.slice(start, end + 1));
}

export async function completeJson<T>(complete: Complete, system: string, user: string, check: (v: unknown) => T): Promise<T> {
  let reason = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = attempt === 0 ? user : `${user}\n\nYour previous reply was rejected: ${reason}. Reply with only the corrected JSON object.`;
    const text = await complete(system, prompt);
    try {
      return check(extractJson(text));
    } catch (e) {
      reason = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`model reply rejected twice: ${reason}`);
}
