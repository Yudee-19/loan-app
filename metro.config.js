/**
 * Metro bundler configuration for LoanTracker.
 * Wraps the default Expo config with NativeWind to enable
 * Tailwind CSS processing during the Metro build.
 */
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: "./global.css" });
