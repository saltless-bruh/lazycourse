export async function askNumber(ask) {
  for (;;) {
    const text = (await ask("Enter a number: ")).trim();
    if (/^-?\d+$/.test(text)) return Number(text);
  }
}
