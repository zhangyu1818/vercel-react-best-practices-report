import { defineConfig } from '@zhangyu1818/eslint-config'

export default defineConfig(
  {
    presets: {
      prettier: true,
      typescript: {
        project: './tsconfig.eslint.json',
        rules: {
          '@typescript-eslint/no-unnecessary-condition': 'off',
        },
      },
    },
  },
  [
    { ignores: ['bin/**'] },
    {
      files: ['src/bin/**/*.{ts,tsx}', 'test/**/*.ts'],
      languageOptions: {
        parserOptions: {
          project: './tsconfig.eslint.json',
        },
      },
    },
  ],
)
