/**
 * logger 的测试替身：真实 logger 在模块求值期调用 electron 的 app.getPath，
 * 纯 Node 环境无法加载。经 vitest.config.ts 的 alias 注入。
 */
export function log(..._args: unknown[]): void {}
export function error(..._args: unknown[]): void {}
export function warn(..._args: unknown[]): void {}
