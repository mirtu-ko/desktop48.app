/**
 * 媒体播控 / 窗口图标 path 数据（统一 24 viewBox，颜色交给 CSS currentColor）。
 * 只存几何数据，渲染壳由使用方决定：播放器统一走 MediaIcon.vue 线性（stroke）壳，
 * FloatAudioBar 的走带键用实心（fill）壳。
 * 播放器的图标不要再引 @element-plus/icons-vue：实心风格的路径描边粗细与这里不一致，混排不协调。
 */
export const MEDIA_ICONS = {
  /** 线性风格：MediaIcon.vue 统一渲染（fill:none + stroke:currentColor + stroke-width:2） */
  stroke: {
    play: 'M5 3l14 9-14 9V3z',
    pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
    // 喇叭声波是全套里唯一容易越界的方向，统一收进 ~4..20 安全区（成对改，保持两态一致）
    volumeOn: 'M11 5 6 9H4v6h2l5 4zM14.5 8.5a5 5 0 0 1 0 7M17 5.5a9 9 0 0 1 0 13',
    volumeOff: 'M11 5 6 9H4v6h2l5 4zM20 9.5 15 14.5M15 9.5l5 5',
    // 窗口换档：与 AppTitleBar 最大化/还原同一语言——单框=放大，双叠框=还原
    windowMaximize: 'M5 5h14v14H5z',
    windowRestore: 'M5 15V5h10M8 8h11v11H8z',
    // 画中画：外框 + 右下小窗
    pip: 'M4 5h16v14H4zM12 11h6v5h-6z',
    // 窗口 / 标题栏动作
    close: 'M6 6 18 18M18 6 6 18',
    minus: 'M5 12h14',
    // 全屏：四角外扩；minimize 为四角内收（全屏态下按钮语义翻转）
    fullscreen: 'M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3',
    minimize: 'M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3',
    // 旋转：r7 圆环 + 顶部切向箭头，左右互为镜像。
    // 箭头是内切圆 < 半个描边宽的小闭三角，stroke 会糊满内部形成实心三角头，
    // 无需给 MediaIcon 开 fill 例外；收在缺口一侧，不外伸到边角
    rotateLeft: 'M8.4 6a7 7 0 1 0 7.2 0M13.9 5 16.35 4.7 14.85 7.3z',
    rotateRight: 'M15.6 6a7 7 0 1 1-7.2 0M10.1 5 7.65 4.7 9.15 7.3z',
    // 录制（摄像机）/ 下载 / 微调设置（推子）
    videoCamera: 'M3 5h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM23 7l-7 5 7 5V7z',
    download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
    settings: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
    // 弹幕气泡（圆点用零长度线段 + round linecap 画出）
    chat: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5zM8 12h.01M12 12h.01M16 12h.01',
    // 列表清理 / 搜索
    trash: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6',
    search: 'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM21 21l-4.3-4.3',
  },
  /** 实心风格：FloatAudioBar（壳需 fill:currentColor） */
  fill: {
    prev: 'M6 6h2v12H6zm3.5 6 8.5 6V6z',
    play: 'M8 5v14l11-7z',
    pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z',
    next: 'M6 18l8.5-6L6 6v12zM16 6h2v12h-2z',
    playlist: 'M3 6h13v2H3zm0 5h13v2H3zm0 5h9v2H3zm15-3.5 5 3.5-5 3.5z',
  },
} as const
