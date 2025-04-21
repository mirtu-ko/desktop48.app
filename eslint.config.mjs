import antfu from '@antfu/eslint-config'

export default antfu({
  formatters: true,
  vue: true,
  ignores: ['node_modules', 'build', 'out', 'dist'],
}, {
  rules: {
    'vue/eqeqeq': 'off',
    'no-console': 'off',
    'eqeqeq': 'off',
    'node/prefer-global/process': 'off',
    'n/prefer-global/process': 'off',
  },
})
