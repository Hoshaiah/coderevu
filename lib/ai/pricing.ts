export const CHAT_MODEL = "claude-haiku-4-5" as const;

export const PRICING_USD_PER_MTOK = {
  [CHAT_MODEL]: { input: 1.0, output: 5.0 },
} as const;

export function computeCostUsd(
  model: keyof typeof PRICING_USD_PER_MTOK,
  tokensIn: number,
  tokensOut: number,
): number {
  const p = PRICING_USD_PER_MTOK[model];
  return (tokensIn * p.input + tokensOut * p.output) / 1_000_000;
}
