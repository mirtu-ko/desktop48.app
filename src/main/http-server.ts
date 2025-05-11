import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { app } from 'electron'

const tempDir = path.join(app.getPath('temp'), 'desktop48_hls')

// 创建服务器实例
const server = http.createServer((req, res) => {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD')
  res.setHeader('Access-Control-Allow-Headers', '*')

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const filePath = path.join(tempDir, req.url!)

  if (req.url?.endsWith('.m3u8')) {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
  }
  else if (req.url?.endsWith('.ts')) {
    res.setHeader('Content-Type', 'video/MP2T')
  }

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    res.writeHead(404)
    res.end('File not found')
    return
  }

  fs.createReadStream(filePath).pipe(res)
})

// 创建临时目录
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true })
}

// 定义端口范围
let port = 8080
const maxPort = 8090 // 最大尝试端口号

// 尝试监听端口
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
      console.log(`[http-server.ts] HLS 服务器监听端口 ${port}`)
      // 导出当前使用的端口号，供其他模块使用
      exports.serverPort = port
    })
}

// 启动服务器
tryListen()

// 处理服务器错误
server.on('error', (err) => {
  console.error('[http-server.ts] HLS 服务器错误:', err)
})
