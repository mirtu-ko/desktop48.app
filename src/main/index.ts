import { app } from 'electron'

// 主进程入口只做一件事：在任何带副作用的模块被求值之前完成单实例检查。
//
// ESM 规范要求依赖模块先于宿主模块体执行，所以只要用静态 import 引入 app.ts，
// 第二个实例在拿到锁之前就已经打开了日志写入流、读写了 database.json、
// 并抢占了本地 HTTP 端口。这里必须用动态 import 把加载时机推迟到取锁之后。
if (app.requestSingleInstanceLock()) {
  void import('./app')
}
else {
  // 用 exit 而非 quit：quit 是异步的，期间后续代码仍会执行
  app.exit(0)
}
