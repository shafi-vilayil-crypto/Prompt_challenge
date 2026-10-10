// Rough token estimate, the way AI models split text into pieces.
// English: about 4 characters per token. Malayalam script needs far more tokens: about 1 per 2 characters.
// It is an estimate for teaching; real counts differ a little between AI models.

export function estimateTokens(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  const ml = (t.match(/[ഀ-ൿ]/g) ?? []).length;
  const other = t.length - ml;
  return Math.ceil(other / 4) + Math.ceil(ml / 2);
}
