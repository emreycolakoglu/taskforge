import '@testing-library/jest-dom';

// jsdom does not implement pointer capture or scrollIntoView, which Radix
// primitives (Select, Checkbox, Popover, DropdownMenu) invoke during pointer
// interaction. Polyfill them as no-ops so component tests can drive those
// primitives with @testing-library/user-event.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom does not implement matchMedia, which the sidebar's useIsMobile hook
// calls on mount. Default to "not mobile" so the desktop sidebar renders.
if (typeof window.matchMedia === "undefined") {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// cmdk observes its list with ResizeObserver, which jsdom does not provide.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
