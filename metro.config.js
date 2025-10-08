const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  stream: require.resolve('stream-browserify'),
  buffer: require.resolve('buffer/'),
  process: require.resolve('process'),
  util: require.resolve('util/'),
};

// Remove "wasm" from assetExts if it's there
config.resolver.assetExts = config.resolver.assetExts.filter(ext => ext !== "wasm");

// Add wasm to sourceExts so Metro compiles it
config.resolver.sourceExts.push("wasm");

module.exports = config;
