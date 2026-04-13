/**
 * Babel configuration for LoanTracker.
 * - Uses Expo's base preset with NativeWind JSX transform.
 * - Adds NativeWind Babel plugin to compile Tailwind classes at build time.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
