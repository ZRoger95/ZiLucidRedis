export interface DiffSegment {
  text: string;
  changed: boolean;
}

const TOKEN_RE = /(\s+|\S+)/g;
const MAX_TOKENS = 400;

const tokenize = (text: string): string[] => text.match(TOKEN_RE) ?? [];

const pushSegment = (target: DiffSegment[], text: string, changed: boolean) => {
  if (!text) return;
  const last = target[target.length - 1];
  if (last && last.changed === changed) {
    last.text += text;
    return;
  }
  target.push({ text, changed });
};

export function diffSegments(
  leftText: string,
  rightText: string,
): { left: DiffSegment[]; right: DiffSegment[] } {
  const leftTokens = tokenize(leftText);
  const rightTokens = tokenize(rightText);

  if (leftTokens.length > MAX_TOKENS || rightTokens.length > MAX_TOKENS) {
    return {
      left: [{ text: leftText, changed: true }],
      right: [{ text: rightText, changed: true }],
    };
  }

  const rows = leftTokens.length;
  const cols = rightTokens.length;
  const dp: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(cols + 1).fill(0));

  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      dp[i][j] =
        leftTokens[i] === rightTokens[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const left: DiffSegment[] = [];
  const right: DiffSegment[] = [];
  let i = 0;
  let j = 0;

  while (i < rows && j < cols) {
    if (leftTokens[i] === rightTokens[j]) {
      pushSegment(left, leftTokens[i], false);
      pushSegment(right, rightTokens[j], false);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      pushSegment(left, leftTokens[i], true);
      i += 1;
    } else {
      pushSegment(right, rightTokens[j], true);
      j += 1;
    }
  }

  while (i < rows) {
    pushSegment(left, leftTokens[i], true);
    i += 1;
  }
  while (j < cols) {
    pushSegment(right, rightTokens[j], true);
    j += 1;
  }

  return { left, right };
}
