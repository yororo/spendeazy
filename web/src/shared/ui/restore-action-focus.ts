function restoreActionFocus(target: HTMLElement | null | undefined): void {
  let ancestor = target?.parentElement;
  while (ancestor) {
    if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
    ancestor = ancestor.parentElement;
  }
  target?.focus({ preventScroll: true });
}

export { restoreActionFocus };
