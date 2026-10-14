import js from "@eslint/js";
import tseslint from "typescript-eslint";

const noHtmlStrings = ["innerHTML", "outerHTML", "insertAdjacentHTML"].map((property) => ({
  property,
  message: "Build DOM with createElement + textContent (constitution).",
}));

export default tseslint.config(
  { ignores: ["dist/", "coverage/", "web-ext-artifacts/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "max-lines-per-function": ["error", { max: 50, skipBlankLines: true, skipComments: true }],
      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
      "no-restricted-properties": ["error", ...noHtmlStrings],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
    },
  },
  {
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "browser", message: "src/core must stay free of browser APIs (constitution)." },
      ],
    },
  },
  {
    files: ["**/*.test.ts"],
    rules: { "max-lines-per-function": "off" },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: { console: "readonly", process: "readonly" } },
  },
);
