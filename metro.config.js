// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// three >= 0.18x ships its CommonJS entry as a wrapper that calls process.emitWarning, which
// React Native lacks, so `require('three')` (as @react-three/fiber/native does) crashes on
// iOS/Android. Resolve every `three` import to the ES module build: one copy, no wrapper.
const path = require('node:path');
const threeModule = path.join(__dirname, 'node_modules/three/build/three.module.js');
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'three') return { type: 'sourceFile', filePath: threeModule };
  return (resolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
