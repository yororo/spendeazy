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
  window.scrollTo(0, position.windowTop);
  const host = getPageScrollHost();
  if (host) host.scrollTop = position.contentTop;
}

function scrollPageToTop(): void {
  restorePageScroll({ windowTop: 0, contentTop: 0 });
}

export { capturePageScroll, restorePageScroll, scrollPageToTop };
export type { PageScrollPosition };
