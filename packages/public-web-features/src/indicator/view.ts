export function defaultIndicatorTab(params: URLSearchParams) {
  return params.get('compareWith') || params.get('find') ? 'compare' : 'indicator';
}

export function indicatorTab({ search }: { search: string }) {
  const params = new URLSearchParams(search);
  const tab = params.get('tab-indicator');
  switch (tab) {
    case 'indicator':
    case 'areas':
    case 'compare':
    case 'inequalities':
    case 'about':
      return tab;
    default:
      return defaultIndicatorTab(params);
  }
}
