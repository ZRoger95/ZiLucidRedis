export interface FuzzParams {
  multiplier: number;
  seed: number | undefined;
}

function parseIntParam(raw: string, name: string, min: number): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} 必须是不小于 ${min} 的整数，收到：${raw}`);
  }
  return value;
}

export function resolveFuzzParams(rawMultiplier: string | undefined, rawSeed: string | undefined): FuzzParams {
  return {
    multiplier: rawMultiplier ? parseIntParam(rawMultiplier, 'FUZZ_RUNS_MULTIPLIER', 1) : 1,
    seed: rawSeed ? parseIntParam(rawSeed, 'FUZZ_SEED', 0) : undefined,
  };
}
