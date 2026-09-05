import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: [
      // safe-json-file-sync 引用 ./logger，而 logger 在模块求值期就调用 electron 的
      // app.getPath('userData')，纯 Node 测试环境无法加载 → 替换为无副作用 stub
      {
        find: /^\.\/logger$/,
        replacement: fileURLToPath(new URL('./test/stubs/logger.ts', import.meta.url)),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
