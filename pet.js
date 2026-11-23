(function () {
  const STORAGE_KEY = 'our_love_border_collie_v1';
  const MAX_MEAL_JIN = 1.0;                   // 单轮消化最多吃 1.0 斤
  const DIGEST_DURATION_MS = 4 * 3600 * 1000; // 消化时长 4 小时
  const SLEEP_START_HOUR = 23;                // 晚上 23:00 睡觉
  const WAKE_UP_HOUR = 8;                     // 早上 08:00 起床

  const DEFAULT_STATE = {
    name: '小鸡毛',
    weight: 9.2,          // 体重 kg（范围 4.5 ~ 24.0）
    fullness: 75,         // 饱腹度 0 ~ 100
    feedCount: 0,
    petCount: 0,
    digestingJin: 0,      // 当前胃里正在消化的食物（斤）
    digestStartTime: null,
    digestEndTime: null,
    lastVisit: Date.now()
  };

  let sleepTestToggle = false;
  let isDragging = false;

  function round1(num) {
    return Math.round(num * 10) / 10;
  }

  function round2(num) {
    return Math.round(num * 100) / 100;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_STATE };
      const parsed = JSON.parse(raw);
      // 自动把旧版默认名字「奥利奥」切换成「小鸡毛」
      if (parsed.name === '奥利奥') parsed.name = '小鸡毛';
      return { ...DEFAULT_STATE, ...parsed };
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }

  function isRealSleepHour(date = new Date()) {
    const h = date.getHours();
    return h >= SLEEP_START_HOUR || h < WAKE_UP_HOUR;
  }

  function isSleeping() {
    const realSleep = isRealSleepHour();
    return sleepTestToggle ? !realSleep : realSleep;
  }

  function formatCountdown(ms) {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  // 结算消化完成 & 离线饿瘦
  function syncStateWithClock(state, now = Date.now()) {
    let justDigested = null;
    let effectiveLastTime = state.lastVisit || now;

    if (state.digestingJin > 0 && state.digestEndTime && now >= state.digestEndTime) {
      const eatenJin = state.digestingJin;
      const weightGainKg = round2(eatenJin * 0.5); // 1 斤食物消化完长胖 0.5 kg（1 斤）
      const prevWeight = state.weight;
      state.weight = Math.min(24.0, round2(state.weight + weightGainKg));
      const actualGain = round2(state.weight - prevWeight);

      effectiveLastTime = Math.max(effectiveLastTime, state.digestEndTime);
      state.digestingJin = 0;
      state.digestStartTime = null;
      state.digestEndTime = null;

      justDigested = { eatenJin, actualGain };
    }

    if (state.digestingJin === 0) {
      const elapsedHours = Math.max(0, (now - effectiveLastTime) / 3600000);
      if (elapsedHours >= 0.25) {
        const fullnessDrop = elapsedHours * 2.0;
        state.fullness = Math.max(0, round1(state.fullness - fullnessDrop));

        if (elapsedHours > 12 || state.fullness < 25) {
          const hungryHours = elapsedHours > 12 ? elapsedHours - 12 : elapsedHours * 0.5;
          const weightLoss = (hungryHours / 24) * 0.85;
          state.weight = Math.max(4.5, round2(state.weight - weightLoss));
        }
        state.lastVisit = now;
      }
    }

    if (justDigested) {
      state.lastVisit = now;
    }

    saveState(state);
    return justDigested;
  }

  function getBodyStatus(state) {
    if (isSleeping()) {
      return { label: '呼呼大睡', color: '#838bb0', isHungry: false };
    }
    if (state.fullness < 20 || state.weight <= 6.0) {
      return { label: '饿扁小鸡毛', color: '#c4837a', isHungry: true };
    }
    if (state.weight < 8.0) {
      return { label: '瘦瘦小狗', color: '#cf9872', isHungry: true };
    }
    if (state.weight < 12.0) {
      return { label: '元气小鸡毛', color: '#7ea68a', isHungry: false };
    }
    if (state.weight < 16.0) {
      return { label: '软乎乎小胖', color: '#e09b5e', isHungry: false };
    }
    if (state.weight < 20.0) {
      return { label: '圆滚滚面包', color: '#d67e63', isHungry: false };
    }
    return { label: '超级大金猪', color: '#c96565', isHungry: false };
  }

  // 悬浮入口和互动面板共用这只小狗，坐标按参考图的比例绘制。
  function buildXiaoJiMaoSVG(state, mood, dangling = false) {
    const sleeping = !dangling && isSleeping();
    const happy = !sleeping && !dangling && mood === 'happy';
    const eating = !sleeping && !dangling && mood === 'eating';
    const hungry = !sleeping && !dangling && mood === 'idle' && getBodyStatus(state).isHungry;
    const fur = '#e4cca1';
    const ink = '#171411';
    const coral = '#fd7869';

    // 正常体重对应参考图。胖瘦只改变躯干和尾巴，脸与爱心保持原比例。
    const girth = Math.max(0.91, Math.min(1.15, 1 + (state.weight - DEFAULT_STATE.weight) * 0.013));
    let eyes = `
      <circle cx="39.85" cy="46.15" r="0.93"/>
      <circle cx="52.15" cy="45.95" r="0.93"/>`;
    let mouth = `
      <path d="M46.2 47.1v1.5 M39.5 48.65c.75 2.5 5.05 2.3 6.7-.2
               1.35 2.45 5.7 2.7 6.5-.05"/>`;
    if (sleeping) {
      eyes = '<path d="M38.2 46.2q1.7 1.7 3.35 0 M50.5 46q1.65 1.7 3.35 0" fill="none" stroke="currentColor" stroke-width="1.22"/>';
    } else if (dangling) {
      eyes = '<circle cx="39.8" cy="46.1" r="1.2"/><circle cx="52.2" cy="45.9" r="1.2"/>';
      mouth = '<ellipse cx="46.25" cy="50.15" rx="1.55" ry="1.65" fill="#f79c88"/>';
    } else if (eating) {
      mouth = '<path d="M46.2 47.2v1.3 M42.4 49.1q3.9 5.5 7.8-.15z" fill="#f79c88"/>';
    } else if (happy) {
      eyes = '<path d="M38.2 46.6q1.65-2.1 3.35-.1 M50.5 46.35q1.65-2.1 3.35-.1" fill="none" stroke="currentColor" stroke-width="1.25"/>';
    } else if (hungry) {
      mouth = '<path d="M46.2 47.2v1.65 M43.1 50.5q3.1-2.6 6.2 0"/>';
    }

    const tailSpeed = sleeping ? '0s' : (happy || eating || dangling ? '0.4s' : '2.1s');
    const heartClass = happy || eating ? 'jm-heart jm-heart-happy' : 'jm-heart';
    return `
      <svg class="jm-dog-svg" xmlns="http://www.w3.org/2000/svg" viewBox="18 8 56 77"
           aria-hidden="true" focusable="false" fill="${fur}" stroke="${ink}" stroke-width="1.55"
           stroke-linecap="round" stroke-linejoin="round" color="${ink}">
        <path class="${heartClass}" fill="${coral}"
              d="M46.1 32.45c-2.6-.55-9.7-5.35-10.2-10.9-.48-4.05 1.95-7.05 5.35-7.25
                 2.05-.15 3.55.95 4.8 2.55 1.35-1.7 2.8-2.65 4.75-2.45
                 3.2.2 5.82 3.05 5.5 6.95-.35 4.9-6.12 9.63-10.2 11.1z"/>

        <g transform="translate(46 0) scale(${girth.toFixed(3)} 1) translate(-46 0)">
          <path class="jm-tail" style="--jm-wag-period:${tailSpeed}"
                d="M29.85 71.85c-1.5-.6-2.95.02-3.05 1.15-.16 1.1 1.06 1.75 3.13 1.45z"/>
          <path d="M32.2 57.55c-2.35-1.85-5.55-2.3-6.66-.36-1.35 2.3.55 4.05 2.57 5.78
                   .83.72 1.05 1.22 1.02 2.55-.12 2.92.17 6.6.75 11.38
                   .12 1.79 1.91 2.65 3.42 1.23.88-.86 1.48-1.04 2.92-1.19
                   5.62-.82 12.72-1.12 19.07-.24 1.05.06 1.44.38 1.86 1.03
                   .94 1.4 3.37 1.18 3.8-.48.28-4.24 1.56-9.05 1.6-12.8
                   .02-1.02.42-1.47 1.36-2.08 1.61-1.11 3.92-2.48 3.58-4.39
                   -.43-2.5-3.97-2.95-7.38-.59 Q47.6 49.55 32.2 57.55z"/>
        </g>

        <!-- 头部是开放轮廓，颈下仅留一笔珊瑚色项圈。 -->
        <path d="M32.2 57.7c-2.65-1.6-3.35-5.68-1.42-10.12
                 -2.15-.04-3.73-2.04-2.55-5.08 1.34-3.3 5.05-6.8 10.15-4.72
                 4.45-2.89 10.95-2.9 15.93.14 3.64-2.54 8.05.03 10.24 3.95
                 2.27 4.35-.43 7.2-2.92 7.24.85 3.65.19 6.72-2.1 8.78"/>
        <g fill="none">
          <path d="M38.38 37.78q-.96.6-1.64 1.53 M54.31 37.92l.85 1.12
                   M30.78 47.58q1.1-2.55 2.5-3.95 M61.63 49.11q-2.24-2.63-3.29-5.43"/>
          <path d="M32.72 57.86c6.65 2.45 20.18 3.24 26.46.2" stroke="#fa8873" stroke-width="1.72"/>
        </g>
        <g fill="currentColor" stroke="none">${eyes}
          <path d="M44.9 45.8q.35-.65 1.36-.66 1.08-.03 1.31.6.13.75-1.27 1.67-1.41-.81-1.4-1.61z"/>
        </g>
        <g fill="none" stroke-width="1.4">${mouth}</g>
        ${sleeping ? `<g fill="#777d9f" stroke="none" font-family="system-ui, sans-serif" font-weight="650">
          <text x="60" y="36" font-size="4.1" class="jm-z1">z</text>
          <text x="64" y="32.5" font-size="5" class="jm-z2">Z</text>
        </g>` : ''}
      </svg>
    `;
  }

  function injectStyles() {
    if (document.getElementById('jm-pet-styles')) return;
    const style = document.createElement('style');
    style.id = 'jm-pet-styles';
    style.textContent = `
      #jm-pet-root {
        position: fixed;
        right: 24px;
        bottom: 92px;
        z-index: 9999;
        font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
        user-select: none;
      }

      /* 悬浮小鸡毛本体（支持拖动） */
      .jm-badge {
        position: relative;
        width: 74px;
        height: 84px;
        padding: 0;
        border: 0;
        border-radius: 12px;
        background: transparent;
        touch-action: none;
        cursor: grab;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.22s ease;
      }
      .jm-badge:focus-visible {
        outline: 2px solid #b16464;
        outline-offset: 2px;
      }
      .jm-badge:hover {
        transform: translateY(-2px);
      }
      #jm-pet-root.jm-dragging .jm-badge {
        cursor: grabbing;
        transform: rotate(-5deg);
      }
      .jm-badge-svg-wrap {
        width: 100%;
        height: 100%;
        pointer-events: none;
      }
      .jm-badge-pill {
        position: absolute;
        bottom: -12px;
        left: 50%;
        transform: translateX(-50%);
        opacity: 0;
        background: #d68b67;
        color: #fff;
        font-size: 10px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 999px;
        white-space: nowrap;
        box-shadow: 0 3px 8px rgba(180, 115, 80, 0.28);
        pointer-events: none;
      }
      #jm-pet-root.jm-open .jm-badge-pill,
      #jm-pet-root.jm-dragging .jm-badge-pill,
      .jm-badge:focus-visible .jm-badge-pill { opacity: 1; }
      .jm-badge.jm-sleeping .jm-badge-pill {
        background: #838bb0;
      }
      .jm-badge-dot {
        position: absolute;
        top: 2px;
        right: 2px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #ef6f6c;
        border: 2px solid #fff;
        display: none;
        animation: jm-pulse 1.5s infinite;
        pointer-events: none;
      }
      .jm-badge-dot.show { display: block; }

      /* 智能定位玻璃互动面板 */
      .jm-panel {
        position: absolute;
        width: 294px;
        background: rgba(255, 252, 247, 0.97);
        border: 1.5px solid rgba(218, 165, 118, 0.38);
        border-radius: 22px;
        padding: 16px;
        box-shadow: 0 16px 40px rgba(120, 82, 56, 0.18);
        backdrop-filter: blur(14px);
        color: #4a3728;
        opacity: 0;
        visibility: hidden;
        transform: scale(0.95);
        transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), visibility 0.22s;
        pointer-events: none;
      }
      /* 面板自动避让方向 */
      .jm-panel.pos-left { right: 86px; left: auto; }
      .jm-panel.pos-right { left: 86px; right: auto; }
      .jm-panel.pos-up { bottom: -6px; top: auto; }
      .jm-panel.pos-down { top: -6px; bottom: auto; }

      #jm-pet-root.jm-open:not(.jm-dragging) .jm-panel {
        opacity: 1;
        visibility: visible;
        transform: scale(1);
        pointer-events: auto;
      }

      .jm-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }
      .jm-title-wrap {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .jm-name {
        font-size: 15px;
        font-weight: 700;
        color: #4a3525;
        cursor: pointer;
        border-bottom: 1px dashed rgba(175, 125, 85, 0.5);
      }
      .jm-status-tag {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 999px;
        color: #fff;
        font-weight: 600;
      }

      .jm-stage {
        position: relative;
        height: 146px;
        box-sizing: border-box;
        padding: 7px 6px 2px;
        border-radius: 16px;
        background: linear-gradient(180deg, #fff6e8 0%, #fcebd8 100%);
        display: flex;
        flex-direction: column;
        gap: 2px;
        align-items: center;
        cursor: pointer;
        overflow: hidden;
        margin-bottom: 10px;
        transition: background 0.35s ease;
      }
      .jm-stage.jm-night {
        background: linear-gradient(180deg, #e7eaf6 0%, #dce1f2 100%);
      }
      .jm-stage-dog {
        width: 116px;
        flex: 1 1 0;
        min-height: 0;
        transition: transform 0.2s ease;
      }
      .jm-stage-dog.jm-squish {
        animation: jm-squish 0.45s ease;
      }
      .jm-speech {
        flex: 0 0 auto;
        line-height: 1.4;
        background: rgba(255, 255, 255, 0.94);
        color: #6b4e38;
        font-size: 11px;
        padding: 3px 10px;
        border-radius: 999px;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(140, 95, 60, 0.1);
        max-width: 93%;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .jm-float-fx {
        position: absolute;
        font-size: 18px;
        pointer-events: none;
        animation: jm-float-up 0.9s ease-out forwards;
      }

      .jm-stats {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 8px;
        font-size: 12px;
      }
      .jm-stat-box {
        background: #faf1e6;
        border-radius: 10px;
        padding: 6px 9px;
      }
      .jm-stat-label {
        font-size: 10px;
        color: #9c7e65;
        margin-bottom: 2px;
      }
      .jm-stat-val {
        font-weight: 700;
        color: #5a3e2b;
      }

      .jm-digest-box {
        background: #f9efe5;
        border: 1px dashed rgba(208, 145, 98, 0.45);
        border-radius: 11px;
        padding: 7px 10px;
        margin-bottom: 10px;
        font-size: 11px;
        color: #7d5d45;
      }
      .jm-digest-box.active {
        background: #fff4e6;
        border-color: rgba(226, 152, 84, 0.65);
        color: #965e2e;
      }
      .jm-digest-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 6px;
      }
      .jm-digest-bar-bg {
        margin-top: 5px;
        height: 5px;
        background: rgba(215, 165, 120, 0.25);
        border-radius: 999px;
        overflow: hidden;
        display: none;
      }
      .jm-digest-box.active .jm-digest-bar-bg { display: block; }
      .jm-digest-bar-fill {
        height: 100%;
        border-radius: 999px;
        background: linear-gradient(90deg, #f2b76e, #dd854c);
        transition: width 0.5s linear;
      }

      .jm-bar-wrap { margin-bottom: 11px; }
      .jm-bar-top {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        color: #8f7058;
        margin-bottom: 4px;
      }
      .jm-bar-bg {
        height: 7px;
        background: #f0e2d5;
        border-radius: 999px;
        overflow: hidden;
      }
      .jm-bar-fill {
        height: 100%;
        border-radius: 999px;
        background: linear-gradient(90deg, #f2c078, #dc8865);
        transition: width 0.35s ease;
      }

      .jm-actions {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 7px;
      }
      .jm-btn {
        border: 1px solid rgba(208, 145, 98, 0.35);
        background: #fff;
        color: #5b3f2c;
        border-radius: 11px;
        padding: 7px 6px;
        font-size: 11.5px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.18s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
      }
      .jm-btn:hover {
        background: #fff4e8;
        border-color: #d68b67;
        transform: translateY(-1px);
      }
      .jm-btn:active { transform: scale(0.96); }
      .jm-btn.jm-dimmed { opacity: 0.55; }
      .jm-btn-primary {
        background: linear-gradient(135deg, #e7a36f, #d47f64);
        color: #fff;
        border: none;
      }
      .jm-btn-primary:hover {
        background: linear-gradient(135deg, #dc935d, #c67056);
        color: #fff;
      }

      .jm-tip {
        margin-top: 8px;
        font-size: 10px;
        color: #b0927b;
        text-align: center;
      }

      .jm-footer-tools {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px dashed rgba(205, 160, 125, 0.38);
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 6px;
        font-size: 10.5px;
      }
      .jm-link-btn {
        background: none;
        border: none;
        color: #a6866e;
        cursor: pointer;
        padding: 0;
        font-size: 10.5px;
      }
      .jm-link-btn:hover { color: #d47f64; text-decoration: underline; }

      .jm-dog-svg { display: block; width: 100%; height: 100%; }
      .jm-tail {
        transform-box: fill-box;
        transform-origin: right center;
        animation: jm-wag var(--jm-wag-period, 2.1s) ease-in-out infinite;
      }
      .jm-heart {
        transform-box: fill-box;
        transform-origin: center bottom;
        animation: jm-heart-float 2.8s ease-in-out infinite;
      }
      .jm-heart-happy { animation: jm-heart-beat 0.65s ease-in-out infinite; }

      .jm-z1 { animation: jm-zzz 2.4s ease-in-out infinite; }
      .jm-z2 { animation: jm-zzz 2.4s ease-in-out 0.6s infinite; }

      @keyframes jm-wag {
        0%, 100% { transform: rotate(0deg); }
        50% { transform: rotate(12deg); }
      }
      @keyframes jm-heart-float {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-0.8px); }
      }
      @keyframes jm-heart-beat {
        0%, 100% { transform: scale(1); }
        45% { transform: scale(1.09); }
      }
      @keyframes jm-squish {
        0% { transform: scale(1, 1); }
        30% { transform: scale(1.13, 0.87); }
        65% { transform: scale(0.95, 1.06); }
        100% { transform: scale(1, 1); }
      }
      @keyframes jm-float-up {
        0% { opacity: 1; transform: translate(-50%, 0) scale(0.8); }
        100% { opacity: 0; transform: translate(-50%, -44px) scale(1.25); }
      }
      @keyframes jm-pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.25); opacity: 0.7; }
      }
      @keyframes jm-zzz {
        0% { opacity: 0.35; transform: translateY(0); }
        50% { opacity: 0.95; }
        100% { opacity: 0.2; transform: translateY(-2px); }
      }

      @media (max-width: 600px) {
        #jm-pet-root { right: 16px; bottom: 86px; }
        .jm-badge { width: 64px; height: 74px; }
        .jm-panel {
          position: fixed;
          left: 50% !important;
          right: auto !important;
          top: auto !important;
          bottom: 90px !important;
          width: min(296px, calc(100vw - 28px));
          max-height: calc(100dvh - 100px);
          overflow-y: auto;
          transform: translateX(-50%) scale(0.95);
        }
        #jm-pet-root.jm-open:not(.jm-dragging) .jm-panel {
          transform: translateX(-50%) scale(1);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        #jm-pet-root *, #jm-pet-root *::before, #jm-pet-root *::after {
          animation: none !important;
          transition: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function init() {
    injectStyles();

    let state = loadState();
    const initDigested = syncStateWithClock(state);
    let mood = 'idle';
    let moodTimer = null;
    let closeTimer = null;
    let panelPinned = false;
    let lastSleepFlag = isSleeping();

    const root = document.createElement('div');
    root.id = 'jm-pet-root';
    root.innerHTML = `
      <div class="jm-panel pos-left pos-up" id="jm-panel">
        <div class="jm-header">
          <div class="jm-title-wrap">
            <span class="jm-name" id="jm-name" title="点击修改小狗名字"></span>
            <span style="font-size:11px;color:#b5947a;">✎</span>
          </div>
          <span class="jm-status-tag" id="jm-status-tag"></span>
        </div>

        <div class="jm-stage" id="jm-stage" title="点我摸摸头">
          <div class="jm-speech" id="jm-speech">汪！可以按住我到处溜达哦~</div>
          <div class="jm-stage-dog" id="jm-stage-dog"></div>
        </div>

        <div class="jm-stats">
          <div class="jm-stat-box">
            <div class="jm-stat-label">当前体重</div>
            <div class="jm-stat-val" id="jm-weight-val"></div>
          </div>
          <div class="jm-stat-box">
            <div class="jm-stat-label">作息时间</div>
            <div class="jm-stat-val" style="font-size:11px;">23:00 睡 · 08:00 起</div>
          </div>
        </div>

        <div class="jm-digest-box" id="jm-digest-box">
          <div class="jm-digest-row">
            <span id="jm-digest-text"></span>
            <span id="jm-digest-timer" style="font-weight:700;"></span>
          </div>
          <div class="jm-digest-bar-bg">
            <div class="jm-digest-bar-fill" id="jm-digest-fill"></div>
          </div>
        </div>

        <div class="jm-bar-wrap">
          <div class="jm-bar-top">
            <span>饱腹度</span>
            <span id="jm-fullness-val"></span>
          </div>
          <div class="jm-bar-bg">
            <div class="jm-bar-fill" id="jm-bar-fill"></div>
          </div>
        </div>

        <div class="jm-actions">
          <button class="jm-btn jm-btn-primary" data-act="pet">✋ 摸摸头</button>
          <button class="jm-btn" data-act="kibble">🥣 狗粮 0.2斤</button>
          <button class="jm-btn" data-act="chicken">🍗 鸡胸 0.5斤</button>
          <button class="jm-btn" data-act="bone">🦴 肉骨 1.0斤</button>
        </div>

        <div class="jm-tip">✨ 按住小鸡毛可全屏拖动，刷新页面自动回到原位</div>

        <div class="jm-footer-tools">
          <button class="jm-link-btn" id="jm-skip-digest">⏩ 跳过4h消化</button>
          <button class="jm-link-btn" id="jm-toggle-sleep">🌙 预览睡觉</button>
          <button class="jm-link-btn" id="jm-sim-starve">⏩ 3天饿瘦</button>
          <button class="jm-link-btn" id="jm-reset">↺ 重置</button>
        </div>
      </div>

      <button type="button" class="jm-badge" id="jm-badge" title="点击或悬停互动 · 按住可拖动"
              aria-controls="jm-panel" aria-expanded="false">
        <span class="jm-badge-dot" id="jm-badge-dot" aria-hidden="true"></span>
        <span class="jm-badge-svg-wrap" id="jm-badge-svg"></span>
        <span class="jm-badge-pill" id="jm-badge-pill" aria-hidden="true"></span>
      </button>
    `;
    document.body.appendChild(root);

    const els = {
      panel: root.querySelector('#jm-panel'),
      name: root.querySelector('#jm-name'),
      statusTag: root.querySelector('#jm-status-tag'),
      speech: root.querySelector('#jm-speech'),
      stage: root.querySelector('#jm-stage'),
      stageDog: root.querySelector('#jm-stage-dog'),
      weightVal: root.querySelector('#jm-weight-val'),
      digestBox: root.querySelector('#jm-digest-box'),
      digestText: root.querySelector('#jm-digest-text'),
      digestTimer: root.querySelector('#jm-digest-timer'),
      digestFill: root.querySelector('#jm-digest-fill'),
      fullnessVal: root.querySelector('#jm-fullness-val'),
      barFill: root.querySelector('#jm-bar-fill'),
      badge: root.querySelector('#jm-badge'),
      badgeSvg: root.querySelector('#jm-badge-svg'),
      badgePill: root.querySelector('#jm-badge-pill'),
      badgeDot: root.querySelector('#jm-badge-dot'),
      toggleSleepBtn: root.querySelector('#jm-toggle-sleep'),
      feedBtns: root.querySelectorAll('.jm-btn[data-act="kibble"], .jm-btn[data-act="chicken"], .jm-btn[data-act="bone"]')
    };

    // 根据当前拖动位置智能翻转面板展开方向，避免超出屏幕
    function updatePanelDirection() {
      if (window.innerWidth <= 600) return;
      const rect = els.badge.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      els.panel.classList.remove('pos-left', 'pos-right', 'pos-up', 'pos-down');
      els.panel.classList.add(centerX > window.innerWidth / 2 ? 'pos-left' : 'pos-right');
      els.panel.classList.add(centerY > 380 ? 'pos-up' : 'pos-down');
    }

    function setPanelOpen(open) {
      clearTimeout(closeTimer);
      if (open) updatePanelDirection();
      else panelPinned = false;
      root.classList.toggle('jm-open', open);
      els.badge.setAttribute('aria-expanded', String(open));
    }

    function spawnFloat(emoji) {
      const fx = document.createElement('span');
      fx.className = 'jm-float-fx';
      fx.textContent = emoji;
      fx.style.left = (42 + Math.random() * 18) + '%';
      fx.style.top = '45%';
      els.stage.appendChild(fx);
      setTimeout(() => fx.remove(), 900);
    }

    function setSpeech(text) {
      els.speech.textContent = text;
    }

    function triggerSquish() {
      els.stageDog.classList.remove('jm-squish');
      void els.stageDog.offsetWidth;
      els.stageDog.classList.add('jm-squish');
    }

    function updateDigestUI() {
      const now = Date.now();
      if (state.digestingJin > 0 && state.digestEndTime) {
        const remainMs = Math.max(0, state.digestEndTime - now);
        const totalMs = Math.max(1, state.digestEndTime - (state.digestStartTime || (state.digestEndTime - DIGEST_DURATION_MS)));
        const pct = Math.min(100, Math.max(0, ((totalMs - remainMs) / totalMs) * 100));

        els.digestBox.classList.add('active');
        els.digestText.textContent = `消化中：${state.digestingJin.toFixed(1)} / 1.0 斤`;
        els.digestTimer.textContent = `剩 ${formatCountdown(remainMs)}`;
        els.digestFill.style.width = `${pct.toFixed(1)}%`;
      } else {
        els.digestBox.classList.remove('active');
        els.digestText.textContent = '胃里空空 · 单顿上限 1.0 斤';
        els.digestTimer.textContent = '可投喂';
        els.digestFill.style.width = '0%';
      }
    }

    function render(customSpeech) {
      const sleeping = isSleeping();
      const status = getBodyStatus(state);
      const stageSvg = buildXiaoJiMaoSVG(state, mood, false);
      const badgeSvg = buildXiaoJiMaoSVG(state, mood, isDragging);

      els.name.textContent = state.name;
      els.badge.setAttribute('aria-label', `与${state.name}互动`);
      els.statusTag.textContent = status.label;
      els.statusTag.style.background = status.color;

      els.stage.classList.toggle('jm-night', sleeping);
      els.badge.classList.toggle('jm-sleeping', sleeping && !isDragging);

      els.stageDog.innerHTML = stageSvg;
      els.badgeSvg.innerHTML = badgeSvg;

      if (isDragging) {
        els.badgePill.textContent = '🐾 飞起来啦';
      } else if (sleeping) {
        els.badgePill.textContent = '💤 睡觉中';
      } else if (state.digestingJin > 0) {
        els.badgePill.textContent = `⏳ ${state.weight.toFixed(1)}kg`;
      } else {
        els.badgePill.textContent = `${state.weight.toFixed(1)}kg`;
      }

      els.badgeDot.classList.toggle('show', !sleeping && status.isHungry);

      els.weightVal.textContent = `${state.weight.toFixed(1)} kg`;
      els.fullnessVal.textContent = `${Math.round(state.fullness)}%`;
      els.barFill.style.width = `${Math.min(100, Math.max(0, state.fullness))}%`;

      updateDigestUI();

      const cantEatMore = sleeping || state.digestingJin >= MAX_MEAL_JIN;
      els.feedBtns.forEach((btn) => btn.classList.toggle('jm-dimmed', cantEatMore));

      els.toggleSleepBtn.textContent = sleeping
        ? (sleepTestToggle ? '☀️ 退出睡觉预览' : '☀️ 预览清醒')
        : '🌙 预览睡觉';

      if (customSpeech) {
        setSpeech(customSpeech);
      } else if (sleeping) {
        setSpeech('呼噜呼噜…23点啦，早8点起床陪你们玩 💤');
      } else if (state.digestingJin > 0 && mood === 'idle') {
        setSpeech(`正在消化 ${state.digestingJin.toFixed(1)} 斤美食，4小时后长肉~`);
      } else if (status.isHungry && mood === 'idle') {
        setSpeech('好久没来看小鸡毛啦，肚子咕咕叫…');
      }
    }

    function setTempMood(nextMood, duration = 1800) {
      mood = nextMood;
      clearTimeout(moodTimer);
      moodTimer = setTimeout(() => {
        mood = 'idle';
        render();
      }, duration);
    }

    function handlePet() {
      state.petCount += 1;
      state.lastVisit = Date.now();
      saveState(state);

      if (isSleeping()) {
        spawnFloat('💤');
        const dreamLines = [
          '呼噜…轻轻摸摸头好安心，不要吵醒我呀 💤',
          '吧唧嘴…梦里在和小白一起啃大肉骨… 💤',
          '晚安主人，明早 8 点见哦~ 💤'
        ];
        render(dreamLines[state.petCount % dreamLines.length]);
        return;
      }

      setTempMood('happy', 2000);
      triggerSquish();
      spawnFloat('💛');
      const lines = [
        '呜呼~ 好舒服，小鸡毛尾巴摇成电风扇啦！',
        '贴贴！最喜欢你们来看我啦~',
        '再揉揉耳朵嘛，我是最软乎的小金毛！',
        '开心到原地转圈圈！汪汪！'
      ];
      render(lines[state.petCount % lines.length]);
    }

    function handleFeed(foodJin, emoji, foodName) {
      if (isSleeping()) {
        spawnFloat('💤');
        render(`嘘~ ${state.name}睡着啦，明早 8 点醒来再喂吧 💤`);
        return;
      }

      const currentJin = state.digestingJin || 0;
      const remainCapacity = round1(MAX_MEAL_JIN - currentJin);

      if (remainCapacity <= 0) {
        render('这顿已经吃满 1 斤啦！等 4 小时消化完再喂吧~');
        return;
      }

      if (foodJin > remainCapacity) {
        render(`装不下啦！这顿最多吃 1 斤，还能再吃 ${remainCapacity.toFixed(1)} 斤~`);
        return;
      }

      const now = Date.now();
      state.digestingJin = round1(currentJin + foodJin);
      state.digestStartTime = now;
      state.digestEndTime = now + DIGEST_DURATION_MS;
      state.fullness = Math.min(100, round1(state.fullness + foodJin * 55));
      state.feedCount += 1;
      state.lastVisit = now;
      saveState(state);

      setTempMood('eating', 2000);
      triggerSquish();
      spawnFloat(emoji);

      if (state.digestingJin >= MAX_MEAL_JIN) {
        render(`炫完${foodName}刚好 1 斤！4小时消化完就长肉啦~`);
      } else {
        render(`啊呜！吃了${foodName}，还需消化4小时才会长胖哦~`);
      }
    }

    // ========= 全屏拖动逻辑（不存 localStorage，刷新自动回初始位置） =========
    let pointerDown = false;
    let hasMoved = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    function getClientXY(e) {
      if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
      return { x: e.clientX, y: e.clientY };
    }

    function onDragStart(e) {
      if (e.type === 'mousedown' && e.button !== 0) return;
      const pt = getClientXY(e);
      const rect = root.getBoundingClientRect();
      pointerDown = true;
      hasMoved = false;
      startX = pt.x;
      startY = pt.y;
      startLeft = rect.left;
      startTop = rect.top;
    }

    function onDragMove(e) {
      if (!pointerDown) return;
      const pt = getClientXY(e);
      const dx = pt.x - startX;
      const dy = pt.y - startY;

      if (!hasMoved && Math.hypot(dx, dy) > 5) {
        hasMoved = true;
        isDragging = true;
        root.classList.add('jm-dragging');
        setPanelOpen(false);
        // 切为 left/top 定位以便自由移动
        root.style.right = 'auto';
        root.style.bottom = 'auto';
        render();
      }

      if (hasMoved) {
        if (e.cancelable) e.preventDefault();
        const badgeW = els.badge.offsetWidth;
        const badgeH = els.badge.offsetHeight;
        const margin = 8;
        const nextLeft = Math.min(window.innerWidth - badgeW - margin, Math.max(margin, startLeft + dx));
        const nextTop = Math.min(window.innerHeight - badgeH - margin - 10, Math.max(margin, startTop + dy));
        root.style.left = `${nextLeft}px`;
        root.style.top = `${nextTop}px`;
      }
    }

    function onDragEnd() {
      if (!pointerDown) return;
      pointerDown = false;
      if (isDragging) {
        isDragging = false;
        root.classList.remove('jm-dragging');
        updatePanelDirection();
        render('落地啦！换个新角落继续陪你们~');
        // 防止刚松手立即触发 click
        setTimeout(() => { hasMoved = false; }, 60);
      }
    }

    els.badge.addEventListener('mousedown', onDragStart);
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);

    els.badge.addEventListener('touchstart', onDragStart, { passive: true });
    window.addEventListener('touchmove', onDragMove, { passive: false });
    window.addEventListener('touchend', onDragEnd);
    window.addEventListener('touchcancel', onDragEnd);

    // 窗口缩放时保证被拖走的小狗不会跑出可视区域
    window.addEventListener('resize', () => {
      if (root.style.left) {
        const rect = root.getBoundingClientRect();
        const maxLeft = Math.max(8, window.innerWidth - els.badge.offsetWidth - 8);
        const maxTop = Math.max(8, window.innerHeight - els.badge.offsetHeight - 18);
        root.style.left = `${Math.min(maxLeft, Math.max(8, rect.left))}px`;
        root.style.top = `${Math.min(maxTop, Math.max(8, rect.top))}px`;
      }
      updatePanelDirection();
    });

    // 鼠标悬停可临时查看，单击会固定面板，触屏直接点按开关。
    root.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse' && !isDragging) setPanelOpen(true);
    });
    root.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !panelPinned) {
        closeTimer = setTimeout(() => setPanelOpen(false), 260);
      }
    });

    // 点击副标切换展开/收起（若刚刚在拖动则忽略）
    els.badge.addEventListener('click', (e) => {
      e.stopPropagation();
      if (hasMoved) return;
      panelPinned = !panelPinned;
      setPanelOpen(panelPinned);
    });
    document.addEventListener('click', (e) => {
      if (!root.contains(e.target)) setPanelOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && root.classList.contains('jm-open')) {
        if (root.contains(document.activeElement)) els.badge.focus();
        setPanelOpen(false);
      }
    });

    els.stage.addEventListener('click', handlePet);

    root.querySelectorAll('.jm-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        if (act === 'pet') handlePet();
        if (act === 'kibble') handleFeed(0.2, '🥣', '0.2斤狗粮');
        if (act === 'chicken') handleFeed(0.5, '🍗', '0.5斤鸡胸');
        if (act === 'bone') handleFeed(1.0, '🦴', '1斤大肉骨');
      });
    });

    els.name.addEventListener('click', () => {
      const newName = prompt('给你们的小鸡毛取个名字吧：', state.name);
      if (newName && newName.trim()) {
        state.name = newName.trim().slice(0, 10);
        saveState(state);
        render(`汪！以后我就叫${state.name}啦~`);
      }
    });

    root.querySelector('#jm-skip-digest').addEventListener('click', () => {
      if (state.digestingJin <= 0) {
        render('现在胃里空空的，先喂点吃的再测试消化变胖吧~');
        return;
      }
      state.digestEndTime = Date.now() - 1000;
      const done = syncStateWithClock(state);
      if (done) {
        setTempMood('happy', 2500);
        triggerSquish();
        spawnFloat('✨');
        render(`消化完毕！吸收了 ${done.eatenJin.toFixed(1)} 斤，体重 +${done.actualGain.toFixed(2)}kg！`);
      }
    });

    els.toggleSleepBtn.addEventListener('click', () => {
      sleepTestToggle = !sleepTestToggle;
      mood = 'idle';
      render(isSleeping() ? '已切到夜间睡眠预览（23:00-08:00自动生效）💤' : '已切回清醒状态，汪！');
    });

    root.querySelector('#jm-sim-starve').addEventListener('click', () => {
      const shiftMs = 72 * 3600 * 1000;
      state.lastVisit = Date.now() - shiftMs;
      if (state.digestEndTime) state.digestEndTime -= shiftMs;
      if (state.digestStartTime) state.digestStartTime -= shiftMs;
      mood = 'idle';
      syncStateWithClock(state);
      render('呜呜…三天没来看我，小鸡毛都饿瘦啦…');
    });

    root.querySelector('#jm-reset').addEventListener('click', () => {
      const keptName = state.name;
      sleepTestToggle = false;
      state = { ...DEFAULT_STATE, name: keptName, lastVisit: Date.now() };
      mood = 'idle';
      saveState(state);
      render('已恢复默认健康体型，重新开始养小鸡毛吧！');
    });

    setInterval(() => {
      const nowSleeping = isSleeping();
      if (nowSleeping !== lastSleepFlag) {
        lastSleepFlag = nowSleeping;
        render(nowSleeping ? '到晚上 11 点啦，小鸡毛晚安呼呼… 💤' : '早安！8 点起床啦，肚子有点饿~');
        return;
      }

      if (state.digestingJin > 0) {
        if (Date.now() >= state.digestEndTime) {
          const done = syncStateWithClock(state);
          if (done) {
            setTempMood('happy', 2500);
            triggerSquish();
            spawnFloat('✨');
            render(`消化完成！吸收 ${done.eatenJin.toFixed(1)} 斤美食，长胖了 ${done.actualGain.toFixed(2)}kg！`);
          }
        } else {
          updateDigestUI();
        }
      }
    }, 1000);

    if (initDigested) {
      render(`你不在的时候我消化完 ${initDigested.eatenJin.toFixed(1)} 斤啦，体重 +${initDigested.actualGain.toFixed(2)}kg！`);
    } else {
      render();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
