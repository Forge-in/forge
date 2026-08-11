// Root config: serves files that live outside any workspace package.
// Every app and package ships its own eslint.config.mjs re-exporting the
// matching preset from @forge/eslint-config, and that one wins for its files.
export { default } from '@forge/eslint-config/base';
