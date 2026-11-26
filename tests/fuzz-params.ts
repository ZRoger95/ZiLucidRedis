import fc from 'fast-check';

import { resolveFuzzParams } from '../scripts/fuzz-params';

export { resolveFuzzParams } from '../scripts/fuzz-params';

const params = resolveFuzzParams(process.env.FUZZ_RUNS_MULTIPLIER, process.env.FUZZ_SEED);

if (params.seed !== undefined) {
  fc.configureGlobal({ seed: params.seed });
}

export function fuzzRuns(base: number): number {
  return base * params.multiplier;
}
