import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  // Keep the starter on the flat config export that actually runs under the pinned ESLint/Next toolchain.
  ...nextCoreWebVitals,
  {
    rules: {
      // React 19-era rule (eslint-plugin-react-hooks v6) flags the standard
      // "fetch inside useEffect" data-loading pattern used across GeraldOS (and
      // raises false positives for async loaders called from effects). The
      // codebase convention is effect + async fetch with cancellation, so this
      // rule is disabled repo-wide. Real hook-order mistakes are still caught
      // by react-hooks/rules-of-hooks.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts"]),
]);
