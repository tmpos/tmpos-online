import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

export default [
  { ignores: ['dist/**', 'dist-electron/**', 'build/**', 'build00/**', 'node_modules/**', 'tm-cloud/**', 'src/**/*.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['src/**/*.{ts,vue}', 'electron/**/*.ts', 'vite.config.mts'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'] },
      globals: {
        window: 'readonly', document: 'readonly', localStorage: 'readonly', navigator: 'readonly',
        console: 'readonly', fetch: 'readonly', URL: 'readonly', Blob: 'readonly', File: 'readonly',
        Image: 'readonly', Event: 'readonly', CustomEvent: 'readonly', DOMParser: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
        process: 'readonly', Buffer: 'readonly', __dirname: 'readonly', require: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'no-empty': 'off',
      'no-control-regex': 'off',
      'no-unreachable': 'off',
      'prefer-const': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'vue/multi-word-component-names': 'off',
    },
  },
]
