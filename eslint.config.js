import antfu from '@antfu/eslint-config'

export default antfu(
  {
    typescript: true,
    ignores: [
      'dist',
      'src/protect/schemas.ts',
      'spec',
      '.github/instructions',
      '.remember',
      'docs',
    ],
  },
  {
    // Fail the build on any Homebridge, HAP-NodeJS, Node or library API that its
    // own types mark @deprecated, so removals never arrive as surprises. Only
    // this rule is type-aware; the rest of the preset stays syntactic.
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.test.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'ts/no-deprecated': 'error',
    },
  },
)
