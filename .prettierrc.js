module.exports = {
  tabWidth: 2,
  semi: true,
  printWidth: 100,
  trailingComma: "es5",
  arrowParens: "always",
  bracketSpacing: true,
  endOfLine: "lf",
  overrides: [
    {
      files: "*.json.hbs",
      options: {
        parser: "json",
      },
    },
  ],
};
