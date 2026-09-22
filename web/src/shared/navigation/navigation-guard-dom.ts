function isNavigationGuardDialogEvent(event: Event): boolean {
  return (
    event.target instanceof Element &&
    event.target.closest("[data-navigation-guard-dialog]") !== null
  );
}

function isNavigationIntentEvent(event: Event): boolean {
  return (
    event.target instanceof Element &&
    event.target.closest('[data-navigation-intent], a[href]') !== null
  );
}

export { isNavigationGuardDialogEvent, isNavigationIntentEvent };
