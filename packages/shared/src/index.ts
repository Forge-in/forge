// Domain-scoped barrels. Add a sibling folder per domain (billing, gyms,
// sessions...) rather than growing flat files at the package root.
export * from './auth/index.js';
export * from './web/index.js';
export * from './errors/index.js';
