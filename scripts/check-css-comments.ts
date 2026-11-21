import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface CssComment {
  offset: number;
}

export function findCssComments(source: string): CssComment[] {
  const comments: CssComment[] = [];
  let quote: '"' | "'" | undefined;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (quote) {
      if (character === '\\') {
        index += 1;
      } else if (character === quote) {
        quote = undefined;
      }

      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === '/' && source[index + 1] === '*') {
      comments.push({ offset: index });
      index += 1;

      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        index += 1;
      }

      index += 1;
    }
  }

  return comments;
}

function cssFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return cssFiles(path);
    }

    return entry.isFile() && path.endsWith('.css') ? [path] : [];
  });
}

function main(): void {
  const failures = cssFiles('src').flatMap((path) => {
    const source = readFileSync(path, 'utf8');
    return findCssComments(source).map(({ offset }) => {
      const line = source.slice(0, offset).split('\n').length;
      return `${relative('.', path)}:${line}: CSS 注释请移入文档。`;
    });
  });

  if (failures.length > 0) {
    process.stderr.write(`${failures.join('\n')}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
