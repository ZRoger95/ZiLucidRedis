const REQUIRED_PR_SECTIONS = ['背景', '改动', '验证', '备注'] as const;

interface Section {
  line: number;
  title: string;
}

const HEADING_RE = /^ {0,3}##\s+(.+?)\s*$/;
const FENCE_RE = /^\s*(?:```|~~~)/;

function collectSections(lines: readonly string[]): Section[] {
  const sections: Section[] = [];
  let inFence = false;
  lines.forEach((line, index) => {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) {
      return;
    }
    const match = HEADING_RE.exec(line);
    if (match?.[1] !== undefined) {
      sections.push({ line: index, title: match[1] });
    }
  });
  return sections;
}

export function validatePrBody(body: string): string[] {
  const lines = body.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  const sections = collectSections(lines);
  const errors: string[] = [];
  const required = REQUIRED_PR_SECTIONS.map((title) => {
    const matches = sections.filter((section) => section.title === title);
    if (matches.length === 0) {
      errors.push(`缺少「## ${title}」小节`);
      return null;
    }
    if (matches.length > 1) {
      errors.push(`「## ${title}」出现了 ${matches.length} 次`);
    }
    return matches[0] ?? null;
  });
  const found = required.filter((section): section is Section => section !== null);

  if (found.length === REQUIRED_PR_SECTIONS.length) {
    const order = found.map((section) => section.line);
    const sorted = [...order].sort((left, right) => left - right);
    if (order.some((line, index) => line !== sorted[index])) {
      errors.push(`小节顺序应为：${REQUIRED_PR_SECTIONS.map((title) => `## ${title}`).join(' → ')}`);
    }
  }

  const verify = required[2];
  if (verify !== null) {
    const end = sections.find((section) => section.line > verify.line)?.line ?? lines.length;
    const content = lines
      .slice(verify.line + 1, end)
      .map((line) => line.trim())
      .filter((line) => line !== '');
    if (content.length === 0) {
      errors.push('「## 验证」小节为空：写出实际运行的命令和结果');
    }
  }

  return errors;
}
