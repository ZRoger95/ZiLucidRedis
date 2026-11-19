import '@testing-library/jest-dom/vitest';

class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

Object.assign(globalThis, {
  ResizeObserver: ObserverStub,
  // hairline 用 IntersectionObserver 暂停离屏插图，jsdom 没有实现
  IntersectionObserver: ObserverStub,
  // hairline 在模块加载时读取 prefers-reduced-motion
  matchMedia: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  }),
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
