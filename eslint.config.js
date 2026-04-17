import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import mikaDesignSystem from "./eslint-rules/no-hardcoded-tailwind-colors.js";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi", "eslint-rules/**"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "mika-design-system": mikaDesignSystem,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      "mika-design-system/no-hardcoded-tailwind-colors": "error",
    },
  },
  // UI primitives (shadcn) keep their original palette utilities — exempt them.
  {
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "mika-design-system/no-hardcoded-tailwind-colors": "off",
    },
  },
  eslintPluginPrettier,
);
