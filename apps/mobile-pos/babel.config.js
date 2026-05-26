/**
 * Babel config for Expo SDK 54 (Reanimated 4).
 *
 * Reanimated 4 split the worklets transform into a separate package; the
 * plugin moved from `react-native-reanimated/plugin` to
 * `react-native-worklets/plugin`. The plugin must be last in the `plugins`
 * array so it sees the final AST after every other transform.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["react-native-worklets/plugin"],
  };
};
