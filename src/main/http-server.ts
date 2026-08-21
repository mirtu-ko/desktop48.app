import http from 'node:http'
import { createFlvStreamProcess } from './stream.js'

let _serverPort = 8080
export const serverPort = () => _serverPort

const liveFlvPathRegex = /^\/live\/([^/]+)\.flv$/

// 本地 HTTP 服务只负责两件事：
// 1. 把渲染进程要播放的本地地址映射到直播会话
// 2. 把 FFmpeg 的 stdout 直接作为 HTTP-FLV 响应输出给播放器
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const requestUrl = new URL(req.url || '/', 'http://localhost')
  const requestPath = decodeURIComponent(requestUrl.pathname)
  const liveMatch = requestPath.match(liveFlvPathRegex)

  if (!liveMatch) {
    res.writeHead(404)
    res.end('File not found')
    return
  }

  const liveId = liveMatch[1]

  try {
    const ffmpeg = createFlvStreamProcess(liveId)
    let responseClosed = false
    let hasReceivedData = false

    res.writeHead(200, {
      'Content-Type': 'video/x-flv',
      'Connection': 'close',
    })

    // 浏览器标签切换、播放器销毁或用户关闭页面时，都要尽快结束对应 FFmpeg。
    const closeResponse = () => {
      if (responseClosed)
        return

      responseClosed = true
      try {
        ffmpeg.stdout.unpipe(res)
      }
      catch (err) {
        console.error('[http-server.ts] 断开直播流管道失败:', err)
      }

      try {
        if (!ffmpeg.killed)
          ffmpeg.kill('SIGKILL')
      }
      catch (err) {
        console.error('[http-server.ts] 关闭直播流进程失败:', err)
      }
    }

    req.on('close', closeResponse)
    res.on('close', closeResponse)
    res.on('finish', closeResponse)
    req.on('aborted', closeResponse)

    ffmpeg.stdout.on('data', () => {
      hasReceivedData = true
    })

    ffmpeg.stdout.on('error', (err) => {
      console.error('[http-server.ts] 读取直播流失败:', err)
      if (!res.headersSent)
        res.writeHead(500)
      res.end('Read error')
      closeResponse()
    })

    ffmpeg.on('close', (code, signal) => {
      if (responseClosed)
        return

      if (!res.headersSent) {
        res.writeHead(hasReceivedData ? 200 : 502)
      }

      res.end(code === 0 || signal === 'SIGTERM' || signal === 'SIGKILL'
        ? ''
        : 'Stream closed unexpectedly')
      closeResponse()
    })

    ffmpeg.stdout.pipe(res)
  }
  catch (err: any) {
    console.error('[http-server.ts] 创建直播流失败:', err)
    res.writeHead(500)
    res.end(err?.message || 'Stream error')
  }
})

let port = 8080
const maxPort = 8090

// 应用内可能同时存在多个实例竞争端口，所以按区间向后尝试即可。
function tryListen() {
  server.listen(port)
    .on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[http-server.ts] 端口 ${port} 已被占用，尝试下一个端口`)
        if (port < maxPort) {
          port++
          tryListen()
        }
        else {
          console.error('[http-server.ts] 无法找到可用端口')
        }
      }
      else {
        console.error('[http-server.ts] 服务器错误:', err)
      }
    })
    .on('listening', () => {
      console.log(`[http-server.ts] 本地流媒体服务器监听端口 ${port}`)
      _serverPort = port
    })
}

tryListen()

server.on('error', (err) => {
  console.error('[http-server.ts] 本地流媒体服务器错误:', err)
})
