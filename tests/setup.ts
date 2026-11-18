import '@testing-library/jest-dom/vitest';

Object.assign(globalThis, {
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});

Object.assign(Element.prototype, {
  scrollIntoView: () => {},
  hasPointerCapture: () => false,
  setPointerCapture: () => {},
  releasePointerCapture: () => {},
});

// jsdom 没有实现 Range 的布局测量，CodeMirror 的选区测量会调用它
Object.assign(Range.prototype, {
  getClientRects: () => [],
  getBoundingClientRect: () => new DOMRect(),
});
