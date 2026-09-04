# desktop48.app

Fork from [desktop48](https://github.com/Jarvay/desktop48).

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

## 预览

![Desktop48 截图](resources/screenshot.png)

## macOS 常见问题

### 打开提示"已损坏，无法打开"

从 GitHub Releases 直接下载的 macOS 应用未经 Apple 公证，会被 Gatekeeper 拦截。

**临时解决**：

```bash
# 移除 quarantine 属性
sudo xattr -rd com.apple.quarantine /Applications/Desktop48.app
```

或者在访达中右键应用 → 选择「打开」（而非双击），在弹出的对话框中点击「打开」。

## 开源协议

本项目基于 [MIT License](LICENSE) 开源。