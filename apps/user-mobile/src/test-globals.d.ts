/**
 * Pulls jest's global describe/it/expect into scope for *.test.tsx.
 *
 * Needed because Expo's tsconfig base uses `moduleResolution: "bundler"`, under which
 * TypeScript's automatic @types discovery does not pick up @types/jest from this app's
 * node_modules. A reference directive is used rather than an explicit `types: [...]`
 * array in tsconfig, because setting `types` disables auto-discovery for *everything*
 * else and would silently drop future @types packages.
 */
/// <reference types="jest" />
