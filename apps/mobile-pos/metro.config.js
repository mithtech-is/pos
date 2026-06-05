// Metro configuration tuned for an npm-workspace monorepo.
//
// Background: the workspace root has React 18 installed (for the Medusa admin
// dashboard). The mobile app uses React 19 (nested in apps/mobile-pos/
// node_modules). If both Reacts end up in the bundle the runtime crashes
// with "Invalid hook call / Cannot read property 'useRef' of null".
//
// Strategy:
//   • Leave hierarchical lookup ON so transitive nested deps (e.g. is-arrayish
//     inside simple-swizzle/node_modules/) keep resolving.
//   • Resolve "react" / "react-native" ourselves via Node's `require.resolve`
//     from the app root, then hand Metro the absolute file path. This is the
//     most reliable way to force a singleton — it bypasses Metro's resolution
//     entirely for the pinned packages.
//   • @pos/shared aliased to the package source.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const Module = require("module");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");
const sharedSrc = path.join(monorepoRoot, "packages/shared/src");
const localNodeModules = path.join(projectRoot, "node_modules");

const config = getDefaultConfig(projectRoot);

// This app owns a dedicated dev-server port (8088), deliberately NOT Expo's
// default 8081, so it never collides with other Expo projects on this machine.
// The Expo URL is therefore always exp://<your-lan-ip>:8088. The package.json
// scripts and start-mobile.bat also pass `--port 8088`; this is the backstop so
// even a bare `npx expo start` lands on the same port. RCT_METRO_PORT overrides.
const RESERVED_EXPO_PORT = Number(process.env.RCT_METRO_PORT) || 8088;
config.server = { ...(config.server || {}), port: RESERVED_EXPO_PORT };

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  localNodeModules,
  path.join(monorepoRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = false;
config.resolver.extraNodeModules = {
  "@pos/shared": sharedSrc,
};

// Packages that must be a singleton. Any import for these (or a subpath of
// these) gets re-resolved using Node's own require.resolve, scoped to the
// app-local node_modules. This sidesteps Metro's resolver entirely for the
// pinned names, so we cannot accidentally pick up the workspace-root copy.
const PINNED = ["react", "react-native"];

// A Node Module-style resolver rooted at the app dir. The `paths` parameter
// in createRequire isn't enough for some cases; this is bullet-proof.
const localRequire = Module.createRequire(path.join(projectRoot, "package.json"));

function resolvePinned(moduleName) {
  try {
    return localRequire.resolve(moduleName);
  } catch {
    return null;
  }
}

const baseResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const head = moduleName.split("/")[0];
  if (PINNED.includes(head)) {
    const filePath = resolvePinned(moduleName);
    if (filePath) {
      return { type: "sourceFile", filePath };
    }
  }
  return baseResolveRequest
    ? baseResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
