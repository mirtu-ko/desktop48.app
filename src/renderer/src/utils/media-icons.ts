/**
 * 媒体播控 / 窗口图标 path 数据（统一 24 viewBox，颜色交给 CSS currentColor）。
 * 只存几何数据，渲染壳由使用方决定：MiniControls / FloatPlayer 标题栏用线性（stroke）壳，
 * FloatAudioBar 用实心（fill）壳。
 */
export const MEDIA_ICONS = {
  /** 线性风格：MiniControls、FloatPlayer 标题栏（壳需 fill:none + stroke:currentColor） */
  stroke: {
    play: 'M5 3l14 9-14 9V3z',
    pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
    volumeOn: 'M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
    volumeOff: 'M11 5 6 9H3v6h3l5 4zM23 9l-6 6M17 9l6 6',
    // 窗口换档：与 AppTitleBar 最大化/还原同一语言——单框=放大，双叠框=还原
    windowMaximize: 'M5 5h14v14H5z',
    windowRestore: 'M5 15V5h10M8 8h11v11H8z',
    // 画中画：外框 + 右下小窗
    pip: 'M4 5h16v14H4zM12 11h6v5h-6z',
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
