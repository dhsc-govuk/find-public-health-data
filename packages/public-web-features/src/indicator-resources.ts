// The indicator page's resource routes, for an app that serves them at its own addresses. They
// run only on the server, so they have a subpath of their own, kept out of any page's bundle.
export { loadCompareAreaDetail } from './indicator/compare-areas-route.ts';
export { loadIndicatorCsv } from './indicator/csv.ts';
export { loadGeography } from './indicator/geography-loader.ts';
export { loadIndicatorMetadata } from './indicator/metadata-route.ts';
export { loadIndicatorSearch } from './indicator/search-loader.ts';
