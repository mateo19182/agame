import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

const unusedVars = [
  "error",
  { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
];

export default tseslint.config(
  { ignores: ["dist", "node_modules", ".wrangler", ".open-next", "worker-configuration.d.ts"] },
  // Client (React) source.
  {
    files: ["src/**/*.{ts,tsx}", "shared/**/*.ts"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      // Includes the react-hooks/react-compiler rule that flags code the
      // React Compiler can't safely optimize.
      reactHooks.configs["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": unusedVars,
    },
  },
  // Worker source (no DOM, no react-refresh).
  {
    files: ["worker/**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.worker,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": unusedVars,
    },
  },
);
