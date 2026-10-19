export async function askNumber(ask: (prompt: string) => Promise<string>): Promise<number> {
  for (;;) {
    const text = (await ask("Enter a number: ")).trim();
    if (/^-?\d+$/.test(text)) return Number(text);
  }
}
