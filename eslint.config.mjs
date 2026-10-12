import cds from "@sap/cds/eslint.config.mjs";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default [
  // Base CDS config (eslint:recommended + CDS globals + browser/test configs + ignores)
  ...cds,

  // Global ignores for generated/build output
  {
    ignores: ["gen/", "templates/"],
  },

  // TypeScript files: parser + recommended rules
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["**/*.ts"],
  })),

  // TypeScript source rules
  {
    files: ["**/*.ts"],
    rules: {
      "no-await-in-loop": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
      // Disable ESLint rules that typescript-eslint replaces
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-require-imports": "off", // cds-plugin.ts uses require()
      // CDS types are incomplete — @ts-ignore/@ts-expect-error without descriptions is common
      "@typescript-eslint/ban-ts-comment": [
        "warn",
        {
          "ts-ignore": "allow-with-description",
          "ts-expect-error": "allow-with-description",
          minimumDescriptionLength: 0,
        },
      ],
      // CDS/CAP APIs are often dynamically typed — warn instead of error
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // JavaScript source rules (for UI5 app controllers, etc.)
  {
    files: ["**/*.js"],
    rules: {
      "no-await-in-loop": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },

  // Test overrides (relaxed rules) — note: directory is "test/", not "tests/"
  {
    files: ["test/**"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-explicit-any": "off",
      // Chai assertions like `expect(...).to.be.true` are expressions
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },

  // Prettier must be last to override conflicting formatting rules
  prettier,
];
