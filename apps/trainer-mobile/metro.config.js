// Learn more: https://docs.expo.dev/guides/customizing-metro/
//
// Monorepo note: since SDK 52, `expo/metro-config` detects the workspace root
// and resolves workspace packages (e.g. @forge/shared) on its own. Do NOT add
// watchFolders / resolver.nodeModulesPaths / disableHierarchicalLookup here —
// Expo's monorepo guide explicitly says to remove them, and they now break
// resolution rather than fix it. This file exists as the extension point for
// real Metro customisation (svg transformer, extra assetExts, etc.).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
