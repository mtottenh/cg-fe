import pluginVue from 'eslint-plugin-vue'
import vueTsEslintConfig from '@vue/eslint-config-typescript'

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'src/api/types.ts',
      'src/api/generated/**',
    ],
  },
  ...pluginVue.configs['flat/recommended'],
  ...vueTsEslintConfig(),
  {
    rules: {
      // Surface but don't fail on `as any` — we have a known backlog (W5.4)
      '@typescript-eslint/no-explicit-any': 'warn',

      // Unused imports/vars: align with tsconfig noUnusedLocals/Parameters.
      // Underscore prefix = explicitly intentional.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'vue/no-unused-vars': ['warn', { ignorePattern: '^_' }],

      // Vuetify uses `v-slot:item.column_name` (dot-notation) which this rule
      // flags as invalid. It's valid Vue, just Vuetify-specific semantics.
      'vue/valid-v-slot': ['error', { allowModifiers: true }],

      // Vue 2 only; the parser trips on TS union casts in templates (`as 'a' | 'b'`).
      'vue/no-deprecated-filter': 'off',

      // Stylistic — don't fight existing code.
      'vue/v-slot-style': 'off',
      'vue/multi-word-component-names': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/attributes-order': 'off',
      'vue/html-closing-bracket-spacing': 'off',
      'vue/attribute-hyphenation': 'off',
      'vue/v-on-event-hyphenation': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/mustache-interpolation-spacing': 'off',
    },
  },
]
