import type { Rule } from 'eslint';

const noSourceComments: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow explanatory source comments.' },
    schema: [],
    messages: { comment: '普通源码注释请移入文档。' },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const isEslintDirective = /^\s*eslint(?:\b|-)/u.test(comment.value);
          const range = comment.range ?? [0, 0];
          const commentText = context.sourceCode.text.slice(range[0], range[1]);
          const isTypeScriptReference = /^\/\/\/\s*<reference\b/u.test(commentText);

          if (!isEslintDirective && !isTypeScriptReference) {
            const position = context.sourceCode.getLocFromIndex(range[0]);
            context.report({ loc: comment.loc ?? { start: position, end: position }, messageId: 'comment' });
          }
        }
      },
    };
  },
};

export default noSourceComments;
