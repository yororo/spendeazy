interface PageScrollPosition {
  readonly windowTop: number;
  readonly contentTop: number;
}

function getPageScrollHost() {
  return document.querySelector<HTMLElement>("[data-page-scroll-host]");
}

function capturePageScroll(): PageScrollPosition {
  return { windowTop: window.scrollY, contentTop: getPageScrollHost()?.scrollTop ?? 0 };
}

function restorePageScroll(position: PageScrollPosition): void {
  cancelPendingRestoration();
  applyPageScroll(position);
}

function applyPageScroll(position: PageScrollPosition): void {
  window.scrollTo(0, position.windowTop);
  const host = getPageScrollHost();
  if (host) host.scrollTop = position.contentTop;
}

let cancelPendingRestoration = () => {};

function preservePageScrollDuringLayoutChange(change: () => void): () => void {
  const scroll = capturePageScroll();
  cancelPendingRestoration();
  const hosts = [document.documentElement, getPageScrollHost()].filter((host): host is HTMLElement => host !== null);
  const anchors = hosts.map(host => host.style.overflowAnchor);
  hosts.forEach(host => { host.style.overflowAnchor = "none"; });
  let active = true;
  const events = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
  const cancel = () => {
    if (!active) return;
    active = false;
    clearTimeout(listenerTimer);
    hosts.forEach((host, index) => { host.style.overflowAnchor = anchors[index]!; });
    events.forEach(event => window.removeEventListener(event, cancel));
  };
  cancelPendingRestoration = cancel;
  // The key gesture choosing a preference may still be bubbling to window.
  const listenerTimer = setTimeout(() => {
    if (active) events.forEach(event => window.addEventListener(event, cancel, { once: true, passive: true }));
  }, 0);
  change();
  // Resolve fallback-font layout while anchoring is suppressed. Keep suppression
  // until the next interaction: re-enabling it can round a new anchor by a pixel.
  void document.documentElement.offsetHeight;
  applyPageScroll(scroll);
  void (document.fonts?.ready ?? Promise.resolve()).then(() => {
    if (!active) return;
    requestAnimationFrame(() => {
      if (!active) return;
      // Fonts can briefly shorten and then expand a page. Restore the requested
      // offset after that final layout, rather than retaining an interim clamp.
      applyPageScroll(scroll);
    });
  });
  return cancel;
}

function scrollPageToTop(): void {
  restorePageScroll({ windowTop: 0, contentTop: 0 });
}

export { capturePageScroll, preservePageScrollDuringLayoutChange, restorePageScroll, scrollPageToTop };
export type { PageScrollPosition };
