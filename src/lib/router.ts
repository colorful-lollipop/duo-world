export function navigate(to: string) {
  if (location.pathname === to) return;
  history.pushState({}, "", to);
  window.scrollTo(0, 0);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function currentPath() {
  return location.pathname;
}