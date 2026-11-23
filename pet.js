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

  // 线条小狗风格 · 小鸡毛（小金毛）手绘矢量 SVG
  function buildXiaoJiMaoSVG(state, mood, dangling = false) {
    const sleeping = isSleeping() && !dangling;
    const status = getBodyStatus(state);
    const isHungry = !sleeping && !dangling && status.isHungry && mood === 'idle';
    const isHappy = !sleeping && !dangling && (mood === 'happy' || mood === 'eating');

    // 体重 4.5 ~ 24.0 kg 映射到身体圆润程度
    const ratio = (state.weight - 4.5) / (24.0 - 4.5);
    const bodyScaleX = +(0.76 + ratio * 0.66).toFixed(3);
    const bodyScaleY = +(0.93 + ratio * 0.16).toFixed(3);
    const headScaleX = +(0.95 + ratio * 0.14).toFixed(3);
    const headScaleY = +(0.97 + ratio * 0.08).toFixed(3);
    const shadowRx = +(26 + ratio * 18).toFixed(1);

    const strokeColor = '#4a3525';
    const furColor = '#fae094';       // 温柔奶油金毛黄
    const earColor = '#f2cb72';       // 耳朵略深一点暖金
    const bellyColor = '#fff7df';     // 浅奶油肚皮

    // 耳朵角度：被拎起时微张，饿/睡时下垂，开心时轻扬
    const earRot = dangling ? -14 : (sleeping ? 12 : (isHungry ? 16 : (isHappy ? -10 : 0)));

    // 眼睛
    let eyesMarkup = `
      <circle cx="56" cy="54" r="3.2" fill="${strokeColor}"/>
      <circle cx="84" cy="54" r="3.2" fill="${strokeColor}"/>
      <circle cx="57" cy="52.8" r="1" fill="#ffffff"/>
      <circle cx="85" cy="52.8" r="1" fill="#ffffff"/>
    `;
    if (dangling) {
      // 被抓起来拖动时的呆萌惊讶眼
      eyesMarkup = `
        <circle cx="56" cy="54" r="3.8" fill="#ffffff" stroke="${strokeColor}" stroke-width="2.2"/>
        <circle cx="56" cy="54" r="1.5" fill="${strokeColor}"/>
        <circle cx="84" cy="54" r="3.8" fill="#ffffff" stroke="${strokeColor}" stroke-width="2.2"/>
        <circle cx="84" cy="54" r="1.5" fill="${strokeColor}"/>
      `;
    } else if (sleeping) {
      eyesMarkup = `
        <path d="M51,54 Q56,59 61,54" fill="none" stroke="${strokeColor}" stroke-width="2.6" stroke-linecap="round"/>
        <path d="M79,54 Q84,59 89,54" fill="none" stroke="${strokeColor}" stroke-width="2.6" stroke-linecap="round"/>
      `;
    } else if (isHappy) {
      eyesMarkup = `
        <path d="M51,55 Q56,49 61,55" fill="none" stroke="${strokeColor}" stroke-width="2.7" stroke-linecap="round"/>
        <path d="M79,55 Q84,49 89,55" fill="none" stroke="${strokeColor}" stroke-width="2.7" stroke-linecap="round"/>
      `;
    } else if (isHungry) {
      eyesMarkup = `
        <circle cx="56" cy="55" r="3.4" fill="${strokeColor}"/>
        <circle cx="84" cy="55" r="3.4" fill="${strokeColor}"/>
        <circle cx="57.2" cy="53.6" r="1.3" fill="#ffffff"/>
        <circle cx="85.2" cy="53.6" r="1.3" fill="#ffffff"/>
        <ellipse cx="53.5" cy="59.5" rx="1.6" ry="2.2" fill="#8fd0f4"/>
        <ellipse cx="86.5" cy="59.5" rx="1.6" ry="2.2" fill="#8fd0f4"/>
        <path d="M51,48.5 L60,50.5" stroke="${strokeColor}" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M89,48.5 L80,50.5" stroke="${strokeColor}" stroke-width="1.8" stroke-linecap="round"/>
      `;
    }

    // 嘴巴（经典线条小狗的 ω 嘴型）
    let mouthMarkup = `
      <path d="M64.5,63 Q67.2,66.5 70,63.2 Q72.8,66.5 75.5,63" fill="none" stroke="${strokeColor}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
    `;
    if (dangling) {
      mouthMarkup = `
        <ellipse cx="70" cy="65" rx="3.2" ry="3.8" fill="#f28f98" stroke="${strokeColor}" stroke-width="2"/>
      `;
    } else if (sleeping) {
      mouthMarkup = `
        <circle cx="70" cy="64.5" r="2.2" fill="#f3a6ad" stroke="${strokeColor}" stroke-width="1.8"/>
      `;
    } else if (isHappy) {
      mouthMarkup = `
        <path d="M64,62.5 Q67,66 70,63 Q73,66 76,62.5" fill="none" stroke="${strokeColor}" stroke-width="2.3" stroke-linecap="round"/>
        <path d="M67.2,64.8 Q70,73 72.8,64.8 Z" fill="#f58f9b" stroke="${strokeColor}" stroke-width="1.8" stroke-linejoin="round"/>
      `;
    } else if (isHungry) {
      mouthMarkup = `
        <path d="M65.5,65.5 Q70,62 74.5,65.5" fill="none" stroke="${strokeColor}" stroke-width="2.2" stroke-linecap="round"/>
      `;
    }

    const tailClass = sleeping
      ? 'jm-tail jm-tail-sleep'
      : (isHappy || dangling ? 'jm-tail jm-tail-fast' : (isHungry ? 'jm-tail jm-tail-slow' : 'jm-tail'));

    const blushOpacity = isHappy ? '0.78' : (dangling ? '0.6' : '0.48');

    const zzzMarkup = sleeping ? `
      <g class="jm-zzz-group" fill="#7c85b0" font-weight="700" font-family="sans-serif">
        <text x="100" y="34" font-size="11" class="jm-z1">z</text>
        <text x="110" y="23" font-size="14" class="jm-z2">Z</text>
        <text x="122" y="13" font-size="10" class="jm-z3">z</text>
      </g>
    ` : '';

    return `
      <svg viewBox="0 0 140 132" class="jm-dog-svg" aria-hidden="true">
        <!-- 地面软阴影（拖动悬空时淡出） -->
        <ellipse cx="70" cy="120" rx="${shadowRx}" ry="5.5" fill="rgba(120, 88, 60, ${dangling ? '0.04' : '0.13'})"/>

        <!-- 毛茸茸小金毛尾巴 -->
        <g class="${tailClass}">
          <path d="M93,97 C109,94 117,81 112,71 C108,64 99,70 98,79 C97,85 91,89 87,90 Z"
                fill="${furColor}" stroke="${strokeColor}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        </g>

        <!-- 软团子身体（随体重变圆或变瘦，线条粗细保持均匀） -->
        <g transform="translate(70, 96) scale(${bodyScaleX}, ${bodyScaleY}) translate(-70, -96)">
          <path d="M46,78 C38,93 41,115 70,115 C99,115 102,93 94,78 C88,69 52,69 46,78 Z"
                fill="${furColor}" stroke="${strokeColor}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
          <!-- 奶油小肚皮 -->
          <ellipse cx="70" cy="99" rx="16" ry="12" fill="${bellyColor}" opacity="0.88"/>
          ${ratio > 0.52 ? `<path d="M58,104 Q70,110 82,104" fill="none" stroke="#e4bc71" stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>` : ''}
        </g>

        <!-- 两只小前爪 + 两只小后脚 -->
        <g class="${dangling ? 'jm-paws-kick' : ''}">
          <!-- 后脚 -->
          <ellipse cx="${(50 - ratio * 6).toFixed(1)}" cy="${dangling ? '115' : '113'}" rx="8" ry="5.2" fill="${furColor}" stroke="${strokeColor}" stroke-width="3"/>
          <ellipse cx="${(90 + ratio * 6).toFixed(1)}" cy="${dangling ? '115' : '113'}" rx="8" ry="5.2" fill="${furColor}" stroke="${strokeColor}" stroke-width="3"/>
          <!-- 前爪 -->
          <path d="M56,92 C54,102 55,112 60,113 C64,114 66,105 65,93" fill="${furColor}" stroke="${strokeColor}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M84,92 C86,102 85,112 80,113 C76,114 74,105 75,93" fill="${furColor}" stroke="${strokeColor}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        </g>

        <!-- 圆滚滚线条小狗头部 -->
        <g transform="translate(70, 54) scale(${headScaleX}, ${headScaleY}) translate(-70, -54)">
          <!-- 左垂耳 -->
          <g transform="rotate(${-earRot} 44 42)">
            <path d="M46,38 C31,37 25,53 29,67 C32,75 43,72 45,62 C46,55 46,45 46,38 Z"
                  fill="${earColor}" stroke="${strokeColor}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
          </g>
          <!-- 右垂耳 -->
          <g transform="rotate(${earRot} 96 42)">
            <path d="M94,38 C109,37 115,53 111,67 C108,75 97,72 95,62 C94,55 94,45 94,38 Z"
                  fill="${earColor}" stroke="${strokeColor}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
          </g>

          <!-- 圆润脸蛋轮廓 -->
          <path d="M42,56 C41,37 53,27 70,27 C87,27 99,37 98,56 C98,72 86,79 70,79 C54,79 42,72 42,56 Z"
                fill="${furColor}" stroke="${strokeColor}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>

          <!-- 头顶两撮标志性小鸡毛呆毛 -->
          <path d="M66,27 C64,20 70,17 72,24 C75,18 81,21 77,27"
                fill="${furColor}" stroke="${strokeColor}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>

          <!-- 浅色小嘴套 -->
          <ellipse cx="70" cy="63" rx="11.5" ry="8" fill="${bellyColor}" opacity="0.85"/>

          <!-- 温柔粉色腮红 -->
          <ellipse cx="49.5" cy="61.5" rx="5.5" ry="3.2" fill="#f79ca5" opacity="${blushOpacity}"/>
          <ellipse cx="90.5" cy="61.5" rx="5.5" ry="3.2" fill="#f79ca5" opacity="${blushOpacity}"/>

          ${eyesMarkup}

          <!-- 圆圆的小棕鼻头 -->
          <ellipse cx="70" cy="58.2" rx="4.2" ry="3.1" fill="${strokeColor}"/>
          <circle cx="68.8" cy="57.2" r="1" fill="#ffffff" opacity="0.5"/>

          ${mouthMarkup}
        </g>

        ${zzzMarkup}
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
        touch-action: none;
      }

      /* 悬浮小鸡毛本体（支持拖动） */
      .jm-badge {
        position: relative;
        width: 74px;
        height: 74px;
        border-radius: 50%;
        background: rgba(255, 251, 244, 0.95);
        border: 2.2px solid rgba(218, 165, 118, 0.6);
        box-shadow: 0 8px 24px rgba(156, 108, 72, 0.18);
        backdrop-filter: blur(10px);
        cursor: grab;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.22s ease, background 0.3s ease;
      }
      .jm-badge.jm-sleeping {
        background: rgba(240, 242, 252, 0.95);
        border-color: rgba(135, 145, 188, 0.6);
      }
      .jm-badge:hover {
        transform: translateY(-3px) scale(1.05);
        box-shadow: 0 12px 28px rgba(156, 108, 72, 0.25);
      }
      #jm-pet-root.jm-dragging .jm-badge {
        cursor: grabbing;
        transform: scale(1.1) rotate(-5deg);
        box-shadow: 0 18px 34px rgba(130, 88, 55, 0.28);
      }
      .jm-badge-svg-wrap {
        width: 62px;
        height: 62px;
        animation: jm-breathe 3s ease-in-out infinite;
        pointer-events: none;
      }
      #jm-pet-root.jm-dragging .jm-badge-svg-wrap {
        animation: none;
      }
      .jm-badge-pill {
        position: absolute;
        bottom: -9px;
        left: 50%;
        transform: translateX(-50%);
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
        border-radius: 16px;
        background: linear-gradient(180deg, #fff6e8 0%, #fcebd8 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        overflow: hidden;
        margin-bottom: 10px;
        transition: background 0.35s ease;
      }
      .jm-stage.jm-night {
        background: linear-gradient(180deg, #e7eaf6 0%, #dce1f2 100%);
      }
      .jm-stage-dog {
        width: 134px;
        height: 126px;
        transition: transform 0.2s ease;
      }
      .jm-stage-dog.jm-squish {
        animation: jm-squish 0.45s ease;
      }
      .jm-speech {
        position: absolute;
        top: 8px;
        left: 50%;
        transform: translateX(-50%);
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

      .jm-dog-svg { width: 100%; height: 100%; overflow: visible; }
      .jm-tail {
        transform-origin: 91px 94px;
        animation: jm-wag 1.3s ease-in-out infinite;
      }
      .jm-tail-fast { animation-duration: 0.32s; }
      .jm-tail-slow { animation-duration: 3.2s; }
      .jm-tail-sleep { animation: none; transform: rotate(-10deg); }

      .jm-paws-kick {
        transform-origin: 70px 105px;
        animation: jm-kick 0.35s ease-in-out infinite alternate;
      }

      .jm-z1 { animation: jm-zzz 2.4s ease-in-out infinite; }
      .jm-z2 { animation: jm-zzz 2.4s ease-in-out 0.6s infinite; }
      .jm-z3 { animation: jm-zzz 2.4s ease-in-out 1.2s infinite; }

      @keyframes jm-wag {
        0%, 100% { transform: rotate(-7deg); }
        50% { transform: rotate(17deg); }
      }
      @keyframes jm-breathe {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-2.5px); }
      }
      @keyframes jm-squish {
        0% { transform: scale(1, 1); }
        30% { transform: scale(1.13, 0.87); }
        65% { transform: scale(0.95, 1.06); }
        100% { transform: scale(1, 1); }
      }
      @keyframes jm-kick {
        0% { transform: rotate(-4deg); }
        100% { transform: rotate(4deg); }
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
        0% { opacity: 0.2; transform: translateY(3px); }
        50% { opacity: 0.95; transform: translateY(-4px); }
        100% { opacity: 0.2; transform: translateY(-9px); }
      }

      @media (max-width: 600px) {
        #jm-pet-root { right: 16px; bottom: 86px; }
        .jm-badge { width: 64px; height: 64px; }
        .jm-badge-svg-wrap { width: 54px; height: 54px; }
        .jm-panel {
          position: fixed;
          left: 50% !important;
          right: auto !important;
          top: auto !important;
          bottom: 90px !important;
          width: min(296px, calc(100vw - 28px));
          transform: translateX(-50%) scale(0.95);
        }
        #jm-pet-root.jm-open:not(.jm-dragging) .jm-panel {
          transform: translateX(-50%) scale(1);
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

      <div class="jm-badge" id="jm-badge" title="悬停互动 · 按住可拖动">
        <span class="jm-badge-dot" id="jm-badge-dot"></span>
        <div class="jm-badge-svg-wrap" id="jm-badge-svg"></div>
        <span class="jm-badge-pill" id="jm-badge-pill"></span>
      </div>
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
        root.classList.remove('jm-open');
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

    // 悬停自动展开（拖动中不展开）
    root.addEventListener('mouseenter', () => {
      if (isDragging) return;
      clearTimeout(closeTimer);
      updatePanelDirection();
      root.classList.add('jm-open');
    });
    root.addEventListener('mouseleave', () => {
      closeTimer = setTimeout(() => {
        root.classList.remove('jm-open');
      }, 260);
    });

    // 点击副标切换展开/收起（若刚刚在拖动则忽略）
    els.badge.addEventListener('click', (e) => {
      e.stopPropagation();
      if (hasMoved) return;
      updatePanelDirection();
      root.classList.toggle('jm-open');
    });
    document.addEventListener('click', (e) => {
      if (!root.contains(e.target)) root.classList.remove('jm-open');
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
