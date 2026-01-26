import { defineConfig } from '@zhangyu1818/eslint-config'

export default defineConfig(
  {
    presets: {
      prettier: true,
      typescript: {
        rules: {
          '@typescript-eslint/no-unnecessary-condition': 'off',
        },
      },
    },
  },
  [{ ignores: ['bin/**'] }],
)
