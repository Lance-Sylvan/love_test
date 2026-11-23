(function () {
  const STORAGE_KEY = 'our_love_border_collie_v1';
  const MAX_MEAL_JIN = 1.0;             // 单轮消化最多吃 1.0 斤
  const DIGEST_DURATION_MS = 4 * 3600 * 1000; // 消化时长 4 小时
  const SLEEP_START_HOUR = 23;          // 晚上 23:00 睡觉
  const WAKE_UP_HOUR = 8;               // 早上 08:00 起床

  const DEFAULT_STATE = {
    name: '奥利奥',
    weight: 9.2,          // 体重 kg（范围 4.5 ~ 24.0）
    fullness: 75,         // 饱腹度 0 ~ 100
    feedCount: 0,
    petCount: 0,
    digestingJin: 0,      // 当前胃里正在消化的食物（斤）
    digestStartTime: null,
    digestEndTime: null,
    lastVisit: Date.now()
  };

  let sleepTestToggle = false; // 仅用于临时预览睡觉/清醒状态

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

  // 结算消化完成 & 离线饿瘦，返回是否刚完成消化
  function syncStateWithClock(state, now = Date.now()) {
    let justDigested = null;
    let effectiveLastTime = state.lastVisit || now;

    // 1. 先检查正在消化的食物是否已经满 4 小时
    if (state.digestingJin > 0 && state.digestEndTime && now >= state.digestEndTime) {
      const eatenJin = state.digestingJin;
      // 1 斤食物消化完后增长 0.5 kg（即 1 斤体重）
      const weightGainKg = round2(eatenJin * 0.5);
      const prevWeight = state.weight;
      state.weight = Math.min(24.0, round2(state.weight + weightGainKg));
      const actualGain = round2(state.weight - prevWeight);

      effectiveLastTime = Math.max(effectiveLastTime, state.digestEndTime);
      state.digestingJin = 0;
      state.digestStartTime = null;
      state.digestEndTime = null;

      justDigested = { eatenJin, actualGain };
    }

    // 2. 如果当前不在消化期，计算距上次活跃后的饥饿与饿瘦消耗
    if (state.digestingJin === 0) {
      const elapsedHours = Math.max(0, (now - effectiveLastTime) / 3600000);
      if (elapsedHours >= 0.25) {
        const fullnessDrop = elapsedHours * 2.0;
        state.fullness = Math.max(0, round1(state.fullness - fullnessDrop));

        // 超过 12 小时没照顾或饱腹度低于 25 时，慢慢变瘦
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
      return { label: '熟睡中', color: '#7b82a6', isHungry: false };
    }
    if (state.fullness < 20 || state.weight <= 6.0) {
      return { label: '饿扁了', color: '#b57c7c', isHungry: true };
    }
    if (state.weight < 8.0) {
      return { label: '瘦巴巴', color: '#c48f75', isHungry: true };
    }
    if (state.weight < 12.0) {
      return { label: '匀称帅气', color: '#7ea68a', isHungry: false };
    }
    if (state.weight < 16.0) {
      return { label: '肉嘟嘟', color: '#d4848c', isHungry: false };
    }
    if (state.weight < 20.0) {
      return { label: '圆滚滚煤球', color: '#cc6f79', isHungry: false };
    }
    return { label: '超级大胖牧', color: '#bf5a66', isHungry: false };
  }

  // 生成随体重、饱腹度、睡眠和互动状态实时变化的边牧 SVG
  function buildBorderCollieSVG(state, mood) {
    const sleeping = isSleeping();
    const status = getBodyStatus(state);
    const isHungry = !sleeping && status.isHungry && mood === 'idle';
    const isHappy = !sleeping && (mood === 'happy' || mood === 'eating');

    // 体重 4.5 ~ 24.0 kg 映射胖瘦比例
    const ratio = (state.weight - 4.5) / (24.0 - 4.5);
    const bodyScaleX = +(0.72 + ratio * 0.76).toFixed(3);
    const bodyScaleY = +(0.90 + ratio * 0.22).toFixed(3);
    const headScaleX = +(0.93 + ratio * 0.18).toFixed(3);
    const headScaleY = +(0.95 + ratio * 0.10).toFixed(3);
    const shadowRx = +(26 + ratio * 22).toFixed(1);

    const earAngle = sleeping ? 22 : (isHungry ? 26 : (isHappy ? -8 : 0));

    let eyesMarkup = `
      <circle cx="57" cy="48" r="3.4" fill="#221e1e"/>
      <circle cx="83" cy="48" r="3.4" fill="#221e1e"/>
      <circle cx="58.2" cy="46.8" r="1.2" fill="#ffffff"/>
      <circle cx="84.2" cy="46.8" r="1.2" fill="#ffffff"/>
    `;
    if (sleeping) {
      eyesMarkup = `
        <path d="M52,48 Q57,53 62,48" fill="none" stroke="#221e1e" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M78,48 Q83,53 88,48" fill="none" stroke="#221e1e" stroke-width="2.4" stroke-linecap="round"/>
      `;
    } else if (isHappy) {
      eyesMarkup = `
        <path d="M52,49 Q57,43 62,49" fill="none" stroke="#221e1e" stroke-width="2.6" stroke-linecap="round"/>
        <path d="M78,49 Q83,43 88,49" fill="none" stroke="#221e1e" stroke-width="2.6" stroke-linecap="round"/>
      `;
    } else if (isHungry) {
      eyesMarkup = `
        <circle cx="57" cy="49" r="3.5" fill="#221e1e"/>
        <circle cx="83" cy="49" r="3.5" fill="#221e1e"/>
        <circle cx="58.5" cy="47.5" r="1.5" fill="#ffffff"/>
        <circle cx="84.5" cy="47.5" r="1.5" fill="#ffffff"/>
        <circle cx="55.5" cy="51.2" r="1.3" fill="#9fd3f5" opacity="0.9"/>
        <circle cx="84.5" cy="51.2" r="1.3" fill="#9fd3f5" opacity="0.9"/>
        <path d="M52,43 L62,45.5" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" opacity="0.7"/>
        <path d="M88,43 L78,45.5" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" opacity="0.7"/>
      `;
    }

    let mouthMarkup = `
      <path d="M65,63 Q67.5,66.5 70,63.5 Q72.5,66.5 75,63" fill="none" stroke="#4a3838" stroke-width="1.8" stroke-linecap="round"/>
    `;
    if (sleeping) {
      mouthMarkup = `
        <ellipse cx="70" cy="64.5" rx="2.3" ry="1.8" fill="#d98c96" opacity="0.75"/>
      `;
    } else if (isHappy) {
      mouthMarkup = `
        <path d="M64,62.5 Q70,68 76,62.5" fill="none" stroke="#4a3838" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M67.5,65 Q70,73 72.5,65 Z" fill="#f28b99"/>
      `;
    } else if (isHungry) {
      mouthMarkup = `
        <path d="M65,66 Q70,62.5 75,66" fill="none" stroke="#4a3838" stroke-width="1.8" stroke-linecap="round"/>
      `;
    }

    const tailClass = sleeping
      ? 'bc-tail bc-tail-sleep'
      : (isHappy ? 'bc-tail bc-tail-fast' : (isHungry ? 'bc-tail bc-tail-slow' : 'bc-tail'));
    const blushOpacity = sleeping ? '0.42' : (isHappy ? '0.75' : (ratio > 0.55 ? '0.5' : '0.25'));

    const zzzMarkup = sleeping ? `
      <g class="bc-zzz-group" fill="#7c85b0" font-weight="700" font-family="sans-serif">
        <text x="98" y="34" font-size="11" class="bc-z1">z</text>
        <text x="108" y="23" font-size="14" class="bc-z2">Z</text>
        <text x="120" y="13" font-size="10" class="bc-z3">z</text>
      </g>
    ` : '';

    return `
      <svg viewBox="0 0 140 130" class="bc-dog-svg" aria-hidden="true">
        <ellipse cx="70" cy="117" rx="${shadowRx}" ry="6.5" fill="rgba(140, 95, 95, 0.14)"/>

        <!-- 边牧黑白尾巴 -->
        <g class="${tailClass}">
          <path d="M92,94 Q117,84 114,62 Q112,56 107,60 Q106,77 88,86 Z" fill="#2c2c34"/>
          <path d="M114,62 Q112,56 107,60 Q108,67 113,68 Z" fill="#ffffff"/>
        </g>

        <!-- 身体 -->
        <g transform="translate(70, 92) scale(${bodyScaleX}, ${bodyScaleY}) translate(-70, -92)">
          <ellipse cx="70" cy="92" rx="30" ry="23" fill="#2c2c34"/>
          <path d="M51,76 Q70,70 89,76 Q92,98 81,111 Q70,115 59,111 Q48,98 51,76 Z" fill="#ffffff"/>
          ${ratio > 0.5 ? '<path d="M56,102 Q70,108 84,102" fill="none" stroke="#ece4e0" stroke-width="1.6" stroke-linecap="round"/>' : ''}
        </g>

        <!-- 四只小白袜爪子 -->
        <ellipse cx="${(50 - ratio * 6).toFixed(1)}" cy="112" rx="7.5" ry="4.8" fill="#ffffff" stroke="#e6dcd8" stroke-width="1"/>
        <ellipse cx="${(90 + ratio * 6).toFixed(1)}" cy="112" rx="7.5" ry="4.8" fill="#ffffff" stroke="#e6dcd8" stroke-width="1"/>
        <ellipse cx="58" cy="115" rx="7" ry="4.8" fill="#ffffff" stroke="#e6dcd8" stroke-width="1"/>
        <ellipse cx="82" cy="115" rx="7" ry="4.8" fill="#ffffff" stroke="#e6dcd8" stroke-width="1"/>

        <!-- 头部 -->
        <g transform="translate(70, 52) scale(${headScaleX}, ${headScaleY}) translate(-70, -52)">
          <g transform="rotate(${-earAngle} 47 36)">
            <path d="M48,32 Q31,20 27,37 Q25,49 38,50 Q44,44 48,38 Z" fill="#25252c"/>
            <path d="M44,35 Q34,29 32,39 Q32,45 38,46 Z" fill="#463a3e" opacity="0.5"/>
          </g>
          <g transform="rotate(${earAngle} 93 36)">
            <path d="M92,32 Q109,20 113,37 Q115,49 102,50 Q96,44 92,38 Z" fill="#25252c"/>
            <path d="M96,35 Q106,29 108,39 Q108,45 102,46 Z" fill="#463a3e" opacity="0.5"/>
          </g>

          <ellipse cx="70" cy="52" rx="27" ry="24" fill="#2c2c34"/>
          <path d="M66.5,28.5 Q70,27.5 73.5,28.5 L75,52 L65,52 Z" fill="#ffffff"/>
          <path d="M45,56 Q48,75 70,76 Q92,75 95,56 Q83,49 70,51.5 Q57,49 45,56 Z" fill="#ffffff"/>

          <ellipse cx="52" cy="59" rx="5.2" ry="3" fill="#f39ca9" opacity="${blushOpacity}"/>
          <ellipse cx="88" cy="59" rx="5.2" ry="3" fill="#f39ca9" opacity="${blushOpacity}"/>

          ${eyesMarkup}

          <ellipse cx="70" cy="57.5" rx="5" ry="3.6" fill="#3a2d2d"/>
          <ellipse cx="68.8" cy="56.5" rx="1.6" ry="0.9" fill="#ffffff" opacity="0.45"/>

          ${mouthMarkup}
        </g>

        ${zzzMarkup}
      </svg>
    `;
  }

  function injectStyles() {
    if (document.getElementById('bc-pet-styles')) return;
    const style = document.createElement('style');
    style.id = 'bc-pet-styles';
    style.textContent = `
      #bc-pet-root {
        position: fixed;
        right: 22px;
        bottom: 92px;
        z-index: 9999;
        font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
        user-select: none;
      }

      .bc-badge {
        position: relative;
        width: 70px;
        height: 70px;
        border-radius: 50%;
        background: rgba(255, 250, 248, 0.94);
        border: 2px solid rgba(217, 155, 155, 0.55);
        box-shadow: 0 8px 24px rgba(156, 98, 98, 0.18);
        backdrop-filter: blur(10px);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease, background 0.3s ease;
      }
      .bc-badge.bc-sleeping {
        background: rgba(238, 240, 250, 0.94);
        border-color: rgba(130, 140, 185, 0.55);
      }
      .bc-badge:hover {
        transform: translateY(-3px) scale(1.05);
        box-shadow: 0 12px 28px rgba(156, 98, 98, 0.26);
      }
      .bc-badge-svg-wrap {
        width: 58px;
        height: 58px;
        animation: bc-breathe 3.2s ease-in-out infinite;
      }
      .bc-badge-pill {
        position: absolute;
        bottom: -9px;
        left: 50%;
        transform: translateX(-50%);
        background: #c97b7b;
        color: #fff;
        font-size: 10px;
        font-weight: 600;
        padding: 2px 7px;
        border-radius: 999px;
        white-space: nowrap;
        box-shadow: 0 3px 8px rgba(180, 100, 100, 0.28);
        letter-spacing: 0.2px;
      }
      .bc-badge.bc-sleeping .bc-badge-pill {
        background: #7b82a6;
      }
      .bc-badge-dot {
        position: absolute;
        top: 2px;
        right: 2px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #ef6f6c;
        border: 2px solid #fff;
        display: none;
        animation: bc-pulse 1.5s infinite;
      }
      .bc-badge-dot.show { display: block; }

      .bc-panel {
        position: absolute;
        right: 82px;
        bottom: -6px;
        width: 294px;
        background: rgba(255, 251, 249, 0.96);
        border: 1px solid rgba(217, 155, 155, 0.38);
        border-radius: 22px;
        padding: 16px;
        box-shadow: 0 16px 40px rgba(120, 74, 74, 0.18);
        backdrop-filter: blur(14px);
        color: #4a3b3b;
        opacity: 0;
        visibility: hidden;
        transform: translateX(12px) scale(0.96);
        transform-origin: right bottom;
        transition: all 0.24s cubic-bezier(0.22, 1, 0.36, 1);
        pointer-events: none;
      }
      #bc-pet-root.bc-open .bc-panel {
        opacity: 1;
        visibility: visible;
        transform: translateX(0) scale(1);
        pointer-events: auto;
      }

      .bc-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }
      .bc-title-wrap {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .bc-name {
        font-size: 15px;
        font-weight: 700;
        color: #4a3535;
        cursor: pointer;
        border-bottom: 1px dashed rgba(180, 120, 120, 0.45);
      }
      .bc-status-tag {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 999px;
        color: #fff;
        font-weight: 600;
      }

      .bc-stage {
        position: relative;
        height: 144px;
        border-radius: 16px;
        background: linear-gradient(180deg, #fdf3ef 0%, #f9ebe6 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        overflow: hidden;
        margin-bottom: 10px;
        transition: background 0.35s ease;
      }
      .bc-stage.bc-night {
        background: linear-gradient(180deg, #e7eaf6 0%, #dce1f2 100%);
      }
      .bc-stage-dog {
        width: 132px;
        height: 124px;
        transition: transform 0.2s ease;
      }
      .bc-stage-dog.bc-squish {
        animation: bc-squish 0.45s ease;
      }
      .bc-speech {
        position: absolute;
        top: 8px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(255, 255, 255, 0.92);
        color: #6e4e4e;
        font-size: 11px;
        padding: 3px 10px;
        border-radius: 999px;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(140, 90, 90, 0.1);
        max-width: 93%;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .bc-float-fx {
        position: absolute;
        font-size: 18px;
        pointer-events: none;
        animation: bc-float-up 0.9s ease-out forwards;
      }

      .bc-stats {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 8px;
        font-size: 12px;
      }
      .bc-stat-box {
        background: #faf2ef;
        border-radius: 10px;
        padding: 6px 9px;
      }
      .bc-stat-label {
        font-size: 10px;
        color: #9a7d7d;
        margin-bottom: 2px;
      }
      .bc-stat-val {
        font-weight: 700;
        color: #5a3e3e;
      }

      /* 消化进度卡片 */
      .bc-digest-box {
        background: #f8f0ec;
        border: 1px dashed rgba(201, 123, 123, 0.35);
        border-radius: 11px;
        padding: 7px 10px;
        margin-bottom: 10px;
        font-size: 11px;
        color: #7c5e5e;
      }
      .bc-digest-box.active {
        background: #fff4ec;
        border-color: rgba(224, 152, 98, 0.55);
        color: #8f5c38;
      }
      .bc-digest-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 6px;
      }
      .bc-digest-bar-bg {
        margin-top: 5px;
        height: 5px;
        background: rgba(215, 165, 130, 0.25);
        border-radius: 999px;
        overflow: hidden;
        display: none;
      }
      .bc-digest-box.active .bc-digest-bar-bg {
        display: block;
      }
      .bc-digest-bar-fill {
        height: 100%;
        border-radius: 999px;
        background: linear-gradient(90deg, #ebb07a, #d9825b);
        transition: width 0.5s linear;
      }

      .bc-bar-wrap {
        margin-bottom: 11px;
      }
      .bc-bar-top {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        color: #8c6f6f;
        margin-bottom: 4px;
      }
      .bc-bar-bg {
        height: 7px;
        background: #f0e1dc;
        border-radius: 999px;
        overflow: hidden;
      }
      .bc-bar-fill {
        height: 100%;
        border-radius: 999px;
        background: linear-gradient(90deg, #e5989b, #c97b7b);
        transition: width 0.35s ease;
      }

      .bc-actions {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 7px;
      }
      .bc-btn {
        border: 1px solid rgba(201, 123, 123, 0.28);
        background: #fff;
        color: #5b3e3e;
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
      .bc-btn:hover {
        background: #fdf0ed;
        border-color: #c97b7b;
        transform: translateY(-1px);
      }
      .bc-btn:active {
        transform: scale(0.96);
      }
      .bc-btn.bc-dimmed {
        opacity: 0.55;
      }
      .bc-btn-primary {
        background: linear-gradient(135deg, #d88c8c, #c57178);
        color: #fff;
        border: none;
      }
      .bc-btn-primary:hover {
        background: linear-gradient(135deg, #cf7e7e, #ba646b);
        color: #fff;
      }

      .bc-footer-tools {
        margin-top: 10px;
        padding-top: 8px;
        border-top: 1px dashed rgba(200, 155, 155, 0.35);
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 6px;
        font-size: 10.5px;
      }
      .bc-link-btn {
        background: none;
        border: none;
        color: #a68686;
        cursor: pointer;
        padding: 0;
        font-size: 10.5px;
      }
      .bc-link-btn:hover { color: #c97b7b; text-decoration: underline; }

      .bc-dog-svg { width: 100%; height: 100%; overflow: visible; }
      .bc-tail {
        transform-origin: 92px 90px;
        animation: bc-wag 1.4s ease-in-out infinite;
      }
      .bc-tail-fast { animation-duration: 0.35s; }
      .bc-tail-slow { animation-duration: 3.4s; }
      .bc-tail-sleep { animation: none; transform: rotate(-10deg); }

      .bc-z1 { animation: bc-zzz 2.4s ease-in-out infinite; }
      .bc-z2 { animation: bc-zzz 2.4s ease-in-out 0.6s infinite; }
      .bc-z3 { animation: bc-zzz 2.4s ease-in-out 1.2s infinite; }

      @keyframes bc-wag {
        0%, 100% { transform: rotate(-6deg); }
        50% { transform: rotate(16deg); }
      }
      @keyframes bc-breathe {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-2.5px); }
      }
      @keyframes bc-squish {
        0% { transform: scale(1, 1); }
        30% { transform: scale(1.12, 0.88); }
        65% { transform: scale(0.95, 1.06); }
        100% { transform: scale(1, 1); }
      }
      @keyframes bc-float-up {
        0% { opacity: 1; transform: translate(-50%, 0) scale(0.8); }
        100% { opacity: 0; transform: translate(-50%, -44px) scale(1.25); }
      }
      @keyframes bc-pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.25); opacity: 0.7; }
      }
      @keyframes bc-zzz {
        0% { opacity: 0.2; transform: translateY(3px); }
        50% { opacity: 0.95; transform: translateY(-4px); }
        100% { opacity: 0.2; transform: translateY(-9px); }
      }

      @media (max-width: 600px) {
        #bc-pet-root { right: 14px; bottom: 84px; }
        .bc-badge { width: 60px; height: 60px; }
        .bc-badge-svg-wrap { width: 50px; height: 50px; }
        .bc-panel {
          right: 0;
          bottom: 76px;
          width: min(290px, calc(100vw - 28px));
          transform: translateY(10px) scale(0.96);
          transform-origin: right bottom;
        }
        #bc-pet-root.bc-open .bc-panel {
          transform: translateY(0) scale(1);
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
    let lastSleepFlag = isSleeping();

    const root = document.createElement('div');
    root.id = 'bc-pet-root';
    root.innerHTML = `
      <div class="bc-panel" id="bc-panel">
        <div class="bc-header">
          <div class="bc-title-wrap">
            <span class="bc-name" id="bc-name" title="点击修改小狗名字"></span>
            <span style="font-size:11px;color:#b09090;">✎</span>
          </div>
          <span class="bc-status-tag" id="bc-status-tag"></span>
        </div>

        <div class="bc-stage" id="bc-stage" title="点我摸摸头">
          <div class="bc-speech" id="bc-speech">汪！把鼠标放上来陪我玩~</div>
          <div class="bc-stage-dog" id="bc-stage-dog"></div>
        </div>

        <div class="bc-stats">
          <div class="bc-stat-box">
            <div class="bc-stat-label">当前体重</div>
            <div class="bc-stat-val" id="bc-weight-val"></div>
          </div>
          <div class="bc-stat-box">
            <div class="bc-stat-label">作息时间</div>
            <div class="bc-stat-val" style="font-size:11px;">23:00 睡 · 08:00 起</div>
          </div>
        </div>

        <div class="bc-digest-box" id="bc-digest-box">
          <div class="bc-digest-row">
            <span id="bc-digest-text"></span>
            <span id="bc-digest-timer" style="font-weight:700;"></span>
          </div>
          <div class="bc-digest-bar-bg">
            <div class="bc-digest-bar-fill" id="bc-digest-fill"></div>
          </div>
        </div>

        <div class="bc-bar-wrap">
          <div class="bc-bar-top">
            <span>饱腹度</span>
            <span id="bc-fullness-val"></span>
          </div>
          <div class="bc-bar-bg">
            <div class="bc-bar-fill" id="bc-bar-fill"></div>
          </div>
        </div>

        <div class="bc-actions">
          <button class="bc-btn bc-btn-primary" data-act="pet">✋ 摸摸头</button>
          <button class="bc-btn" data-act="kibble">🥣 狗粮 0.2斤</button>
          <button class="bc-btn" data-act="chicken">🍗 鸡胸 0.5斤</button>
          <button class="bc-btn" data-act="bone">🦴 肉骨 1.0斤</button>
        </div>

        <div class="bc-footer-tools">
          <button class="bc-link-btn" id="bc-skip-digest">⏩ 跳过4h消化</button>
          <button class="bc-link-btn" id="bc-toggle-sleep">🌙 预览睡觉</button>
          <button class="bc-link-btn" id="bc-sim-starve">⏩ 3天饿瘦</button>
          <button class="bc-link-btn" id="bc-reset">↺ 重置</button>
        </div>
      </div>

      <div class="bc-badge" id="bc-badge" title="悬停或点击互动">
        <span class="bc-badge-dot" id="bc-badge-dot"></span>
        <div class="bc-badge-svg-wrap" id="bc-badge-svg"></div>
        <span class="bc-badge-pill" id="bc-badge-pill"></span>
      </div>
    `;
    document.body.appendChild(root);

    const els = {
      name: root.querySelector('#bc-name'),
      statusTag: root.querySelector('#bc-status-tag'),
      speech: root.querySelector('#bc-speech'),
      stage: root.querySelector('#bc-stage'),
      stageDog: root.querySelector('#bc-stage-dog'),
      weightVal: root.querySelector('#bc-weight-val'),
      digestBox: root.querySelector('#bc-digest-box'),
      digestText: root.querySelector('#bc-digest-text'),
      digestTimer: root.querySelector('#bc-digest-timer'),
      digestFill: root.querySelector('#bc-digest-fill'),
      fullnessVal: root.querySelector('#bc-fullness-val'),
      barFill: root.querySelector('#bc-bar-fill'),
      badge: root.querySelector('#bc-badge'),
      badgeSvg: root.querySelector('#bc-badge-svg'),
      badgePill: root.querySelector('#bc-badge-pill'),
      badgeDot: root.querySelector('#bc-badge-dot'),
      toggleSleepBtn: root.querySelector('#bc-toggle-sleep'),
      feedBtns: root.querySelectorAll('.bc-btn[data-act="kibble"], .bc-btn[data-act="chicken"], .bc-btn[data-act="bone"]')
    };

    function spawnFloat(emoji) {
      const fx = document.createElement('span');
      fx.className = 'bc-float-fx';
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
      els.stageDog.classList.remove('bc-squish');
      void els.stageDog.offsetWidth;
      els.stageDog.classList.add('bc-squish');
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
      const svgHTML = buildBorderCollieSVG(state, mood);

      els.name.textContent = state.name;
      els.statusTag.textContent = status.label;
      els.statusTag.style.background = status.color;

      els.stage.classList.toggle('bc-night', sleeping);
      els.badge.classList.toggle('bc-sleeping', sleeping);

      els.stageDog.innerHTML = svgHTML;
      els.badgeSvg.innerHTML = svgHTML;

      if (sleeping) {
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

      // 睡觉或已吃满 1 斤时，投喂按钮轻微置灰提示
      const cantEatMore = sleeping || state.digestingJin >= MAX_MEAL_JIN;
      els.feedBtns.forEach((btn) => btn.classList.toggle('bc-dimmed', cantEatMore));

      // 更新测试按钮文案
      els.toggleSleepBtn.textContent = sleeping
        ? (sleepTestToggle ? '☀️ 退出睡觉预览' : '☀️ 预览清醒')
        : '🌙 预览睡觉';

      if (customSpeech) {
        setSpeech(customSpeech);
      } else if (sleeping) {
        setSpeech('呼噜呼噜…23点啦，早8点起床陪你们玩 💤');
      } else if (state.digestingJin > 0 && mood === 'idle') {
        setSpeech(`正在消化 ${state.digestingJin.toFixed(1)} 斤美食，4小时后长肉肉~`);
      } else if (status.isHungry && mood === 'idle') {
        setSpeech('好久没来看我啦，肚子咕咕叫…');
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
          '呼噜…轻轻摸头好安心，不要吵醒我呀 💤',
          '吧唧嘴…梦里在追大飞盘和烤肉骨… 💤',
          '晚安主人，明早 8 点见哦~ 💤'
        ];
        render(dreamLines[state.petCount % dreamLines.length]);
        return;
      }

      setTempMood('happy', 2000);
      triggerSquish();
      spawnFloat('❤️');
      const lines = [
        '呜呼~ 好舒服，尾巴摇成螺旋桨啦！',
        '贴贴！最喜欢你们来看我了~',
        '再多摸两下嘛，我是最乖的边牧！',
        '开心到飞起！汪汪！'
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
      state.digestEndTime = now + DIGEST_DURATION_MS; // 每次进食后需消化 4 小时
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

    // 悬停自动展开
    root.addEventListener('mouseenter', () => {
      clearTimeout(closeTimer);
      root.classList.add('bc-open');
    });
    root.addEventListener('mouseleave', () => {
      closeTimer = setTimeout(() => {
        root.classList.remove('bc-open');
      }, 220);
    });

    // 手机端点击副标切换展开/收起
    els.badge.addEventListener('click', (e) => {
      e.stopPropagation();
      root.classList.toggle('bc-open');
    });
    document.addEventListener('click', (e) => {
      if (!root.contains(e.target)) root.classList.remove('bc-open');
    });

    els.stage.addEventListener('click', handlePet);

    root.querySelectorAll('.bc-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        if (act === 'pet') handlePet();
        if (act === 'kibble') handleFeed(0.2, '🥣', '0.2斤狗粮');
        if (act === 'chicken') handleFeed(0.5, '🍗', '0.5斤鸡胸');
        if (act === 'bone') handleFeed(1.0, '🦴', '1斤大肉骨');
      });
    });

    // 改名
    els.name.addEventListener('click', () => {
      const newName = prompt('给你们的小边牧取个名字吧：', state.name);
      if (newName && newName.trim()) {
        state.name = newName.trim().slice(0, 10);
        saveState(state);
        render(`汪！以后我就叫${state.name}啦~`);
      }
    });

    // 测试按钮 1：跳过 4 小时消化（立刻验收变胖效果）
    root.querySelector('#bc-skip-digest').addEventListener('click', () => {
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

    // 测试按钮 2：预览睡觉/清醒状态
    els.toggleSleepBtn.addEventListener('click', () => {
      sleepTestToggle = !sleepTestToggle;
      mood = 'idle';
      render(isSleeping() ? '已切到夜间睡眠预览（23:00-08:00自动生效）💤' : '已切回清醒状态，汪！');
    });

    // 测试按钮 3：模拟 3 天没来饿瘦
    root.querySelector('#bc-sim-starve').addEventListener('click', () => {
      const shiftMs = 72 * 3600 * 1000;
      state.lastVisit = Date.now() - shiftMs;
      if (state.digestEndTime) state.digestEndTime -= shiftMs;
      if (state.digestStartTime) state.digestStartTime -= shiftMs;
      mood = 'idle';
      syncStateWithClock(state);
      render('呜呜…三天没来看我，我都饿瘦啦…');
    });

    // 测试按钮 4：恢复默认
    root.querySelector('#bc-reset').addEventListener('click', () => {
      const keptName = state.name;
      sleepTestToggle = false;
      state = { ...DEFAULT_STATE, name: keptName, lastVisit: Date.now() };
      mood = 'idle';
      saveState(state);
      render('已恢复默认健康体型，重新开始养我吧！');
    });

    // 每秒刷新一次消化倒计时、自动结算消化完成和23:00/08:00作息切换
    setInterval(() => {
      const nowSleeping = isSleeping();
      if (nowSleeping !== lastSleepFlag) {
        lastSleepFlag = nowSleeping;
        render(nowSleeping ? '到晚上 11 点啦，晚安呼呼… 💤' : '早安！8 点起床啦，肚子有点饿~');
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

    // 首次渲染：如果离线期间刚好消化完，主动播报喜讯
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
