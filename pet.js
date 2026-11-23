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
    digestingJin: 0,      // 当前正在消化的食物（斤）
    digestStartTime: null,
    digestEndTime: null,
    lastVisit: Date.now()
  };

  let sleepTestToggle = false;
  let isDragging = false;

  function round1(num) { return Math.round(num * 10) / 10; }
  function round2(num) { return Math.round(num * 100) / 100; }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_STATE };
      const parsed = JSON.parse(raw);
      if (parsed.name === '奥利奥') parsed.name = '小鸡毛';
      return { ...DEFAULT_STATE, ...parsed };
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  function saveState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
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

  function syncStateWithClock(state, now = Date.now()) {
    let justDigested = null;
    let effectiveLastTime = state.lastVisit || now;

    if (state.digestingJin > 0 && state.digestEndTime && now >= state.digestEndTime) {
      const eatenJin = state.digestingJin;
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

    if (justDigested) state.lastVisit = now;
    saveState(state);
    return justDigested;
  }

  function getBodyStatus(state) {
    if (isSleeping()) return { label: '呼呼大睡', color: '#838bb0', isHungry: false };
    if (state.fullness < 20 || state.weight <= 6.0) return { label: '饿扁小鸡毛', color: '#c4837a', isHungry: true };
    if (state.weight < 8.0) return { label: '瘦瘦小狗', color: '#cf9872', isHungry: true };
    if (state.weight < 12.0) return { label: '元气小鸡毛', color: '#7ea68a', isHungry: false };
    if (state.weight < 16.0) return { label: '软乎乎小胖', color: '#e09b5e', isHungry: false };
    if (state.weight < 20.0) return { label: '圆滚滚面包', color: '#d67e63', isHungry: false };
    return { label: '超级大胖毛', color: '#c96565', isHungry: false };
  }

  // 小鸡毛 SVG 模型 (对应 image_5.png)
  function buildXiaoJiMaoSVG(state, mood, dangling = false) {
    const sleeping = isSleeping() && !dangling;
    const isHappy = !sleeping && !dangling && (mood === 'happy' || mood === 'eating');
    const isHungry = !sleeping && !dangling && (getBodyStatus(state).isHungry && mood === 'idle');

    // 体重变胖变瘦影响身体拉伸
    const ratio = (state.weight - 4.5) / (24.0 - 4.5);
    const bodyScaleX = +(0.85 + ratio * 0.50).toFixed(3);
    const bodyScaleY = +(0.95 + ratio * 0.15).toFixed(3);
    const headScaleX = +(0.96 + ratio * 0.12).toFixed(3);
    const headScaleY = +(0.98 + ratio * 0.05).toFixed(3);

    const strokeColor = '#1a110a'; // 深棕色手绘描边
    const furColor = '#e2c092';    // image_5 经典金毛黄
    const heartColor = '#ff6b6b';  // image_5 经典小爱心

    // 动作控制：拖拽时四肢乱甩，平时自然晃动
    const armRotLeft = dangling ? -28 : (isHappy ? -18 : 0);
    const armRotRight = dangling ? 28 : (isHappy ? 18 : 0);
    const footRotLeft = dangling ? 22 : 0;
    const footRotRight = dangling ? -22 : 0;

    let eyesMarkup = `
      <ellipse cx="55.5" cy="54" rx="2.5" ry="1.2" fill="${strokeColor}"/>
      <ellipse cx="84.5" cy="54" rx="2.5" ry="1.2" fill="${strokeColor}"/>
    `;
    if (dangling) {
      eyesMarkup = `
        <ellipse cx="54.5" cy="54" rx="3" ry="3" fill="#fff" stroke="${strokeColor}" stroke-width="2"/>
        <circle cx="54.5" cy="54" r="1.1" fill="${strokeColor}"/>
        <ellipse cx="85.5" cy="54" rx="3" ry="3" fill="#fff" stroke="${strokeColor}" stroke-width="2"/>
        <circle cx="85.5" cy="54" r="1.1" fill="${strokeColor}"/>
      `;
    } else if (sleeping) {
      eyesMarkup = `
        <path d="M51,55 Q55,59 59,55" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M81,55 Q85,59 89,55" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round"/>
      `;
    } else if (isHappy) {
      eyesMarkup = `
        <path d="M51.5,56 Q55.5,50 59.5,56" fill="none" stroke="${strokeColor}" stroke-width="2.8" stroke-linecap="round"/>
        <path d="M80.5,56 Q84.5,50 88.5,56" fill="none" stroke="${strokeColor}" stroke-width="2.8" stroke-linecap="round"/>
      `;
    }

    let mouthMarkup = `
      <path d="M64,62 Q67,65 70,62 Q73,65 76,62" fill="none" stroke="${strokeColor}" stroke-width="2.3" stroke-linecap="round"/>
    `;
    if (dangling) {
      mouthMarkup = `
        <ellipse cx="70" cy="64.5" rx="2.8" ry="3.5" fill="#f5909c" stroke="${strokeColor}" stroke-width="2"/>
      `;
    } else if (isHappy) {
      mouthMarkup = `
        <path d="M64,62.5 Q67,65.5 70,62.5 Q73,65.5 76,62.5" fill="none" stroke="${strokeColor}" stroke-width="2.3" stroke-linecap="round"/>
        <path d="M68,64 Q70,72 72,64 Z" fill="#f58f9b" stroke="${strokeColor}" stroke-width="1.8"/>
      `;
    }

    const zzzMarkup = sleeping ? `
      <g class="jm-zzz-group" fill="#7c85b0" font-weight="700" font-family="sans-serif">
        <text x="104" y="44" font-size="11" class="jm-z1">z</text>
        <text x="114" y="31" font-size="14" class="jm-z2">Z</text>
        <text x="126" y="20" font-size="10" class="jm-z3">z</text>
      </g>
    ` : '';

    return `
      <svg viewBox="0 0 140 134" class="jm-dog-svg" aria-hidden="true" style="overflow: visible;">
        <!-- 顶部动态漂浮红心 -->
        <g class="${isHappy ? 'jm-heart jm-heart-float' : 'jm-heart'}" style="${isHappy ? 'opacity: 1;' : 'opacity: 0;'}">
          <path d="M70,16 C70,16 66.5,10 61,10.5 C55.5,11 53,16 57.5,21.5 C62,27 70,32 70,32 C70,32 78,27 82.5,21.5 C87,16 84.5,11 79,10.5 C73.5,10 70,16 70,16 Z"
                fill="${heartColor}" stroke="${strokeColor}" stroke-width="2.6" stroke-linejoin="round"/>
        </g>

        <!-- 地面阴影 -->
        <ellipse cx="70" cy="120" rx="${shadowRx}" ry="5" fill="rgba(110, 85, 60, ${dangling ? '0.04' : '0.14'})"/>

        <!-- 屁股上那一截几乎看不见的小尾巴 -->
        <path d="M38,103 Q33,101 32,97 Q35,93 39,97 Z" fill="${furColor}" stroke="${strokeColor}" stroke-width="2.6" stroke-linejoin="round"/>

        <!-- 胖乎乎的下半身（随体重变化，保持均匀描边） -->
        <g transform="translate(70, 93) scale(${bodyScaleX}, ${bodyScaleY}) translate(-70, -93)">
          <!-- 身体大圆块 -->
          <path d="M41,75 C30,90 35,115 70,115 C105,115 110,90 99,75 C91,65 49,65 41,75 Z"
                fill="${furColor}" stroke="${strokeColor}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
          <!-- 红色项圈 (对应 image_5.png) -->
          <path d="M42,75 Q70,82 98,75" fill="none" stroke="${heartColor}" stroke-width="4.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
          <path d="M42,75 Q70,82 98,75" fill="none" stroke="${strokeColor}" stroke-dasharray="2 3" stroke-width="0.8" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
        </g>

        <!-- 极其短粗的小后脚 -->
        <g transform="rotate(${footRotLeft} 45 116)">
          <path d="M42,112 C42,121 54,122 54,113 C54,108 42,106 42,112 Z" fill="${furColor}" stroke="${strokeColor}" stroke-width="3" stroke-linejoin="round"/>
        </g>
        <g transform="rotate(${footRotRight} 95 116)">
          <path d="M98,112 C98,121 86,122 86,113 C86,108 98,106 98,112 Z" fill="${furColor}" stroke="${strokeColor}" stroke-width="3" stroke-linejoin="round"/>
        </g>

        <!-- 极其胖乎乎的、像 image_5 里那样平摊的小短手 -->
        <g transform="rotate(${armRotLeft} 40 82)">
          <path d="M42,73 C30,73 28,84 41,86 C46,86 46,73 42,73 Z" fill="${furColor}" stroke="${strokeColor}" stroke-width="3" stroke-linejoin="round"/>
        </g>
        <g transform="rotate(${armRotRight} 100 82)">
          <path d="M98,73 C110,73 112,84 99,86 C94,86 94,73 98,73 Z" fill="${furColor}" stroke="${strokeColor}" stroke-width="3" stroke-linejoin="round"/>
        </g>

        <!-- 扁圆扁圆的线条小狗大脑袋 -->
        <g transform="translate(70, 50) scale(${headScaleX}, ${headScaleY}) translate(-70, -50)">
          <!-- 左垂耳 -->
          <path d="M43,40 C34,32 30,51 34,58 C37,65 46,58 45,46 Z" fill="${furColor}" stroke="${strokeColor}" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
          <!-- 右垂耳 -->
          <path d="M97,40 C106,32 110,51 106,58 C103,65 94,58 95,46 Z" fill="${furColor}" stroke="${strokeColor}" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>

          <!-- 扁圆脑袋轮廓 -->
          <path d="M41,52 C40,33 51,26 70,26 C89,26 100,33 99,52 C99,69 88,74 70,74 C52,74 41,69 41,52 Z"
                fill="${furColor}" stroke="${strokeColor}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>

          <!-- 软萌腮红 -->
          <ellipse cx="48.5" cy="59" rx="4.5" ry="2.2" fill="#fb8c82" opacity="0.6"/>
          <ellipse cx="91.5" cy="59" rx="4.5" ry="2.2" fill="#fb8c82" opacity="0.6"/>

          ${eyesMarkup}

          <!-- 手绘 w 嘴小鸡毛中心 (对应 image_5.png) -->
          <path d="M67,58.5 Q70,60.5 73,58.5" fill="none" stroke="${strokeColor}" stroke-width="2.3" stroke-linecap="round"/>
          <circle cx="70" cy="57" r="2.2" fill="${strokeColor}"/>

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

      .jm-badge {
        position: relative;
        width: 74px;
        height: 74px;
        border-radius: 50%;
        background: rgba(255, 252, 246, 0.95);
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
        transform: scale(1.1) rotate(-4deg);
        box-shadow: 0 18px 34px rgba(130, 88, 55, 0.28);
      }
      .jm-badge-svg-wrap {
        width: 66px;
        height: 66px;
        animation: jm-breathe 3s ease-in-out infinite;
        pointer-events: none;
      }
      #jm-pet-root.jm-dragging .jm-badge-svg-wrap { animation: none; }
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
      .jm-badge.jm-sleeping .jm-badge-pill { background: #838bb0; }
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

      .jm-panel {
        position: absolute;
        width: 294px;
        background: rgba(255, 253, 248, 0.97);
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
      .jm-title-wrap { display: flex; align-items: center; gap: 6px; }
      .jm-name {
        font-size: 15px;
        font-weight: 700;
        color: #4a3525;
        cursor: pointer;
        border-bottom: 1px dashed rgba(175, 125, 85, 0.5);
      }
      .jm-status-tag { font-size: 11px; padding: 2px 8px; border-radius: 999px; color: #fff; font-weight: 600; }

      .jm-stage {
        position: relative;
        height: 146px;
        border-radius: 16px;
        background: linear-gradient(180deg, #fff7ea 0%, #fcecd9 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        overflow: hidden;
        margin-bottom: 10px;
        transition: background 0.35s ease;
      }
      .jm-stage.jm-night { background: linear-gradient(180deg, #e7eaf6 0%, #dce1f2 100%); }
      .jm-stage-dog { width: 134px; height: 126px; transition: transform 0.2s ease; }
      .jm-stage-dog.jm-squish { animation: jm-squish 0.45s ease; }
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

      .jm-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; font-size: 12px; }
      .jm-stat-box { background: #faf1e6; border-radius: 10px; padding: 6px 9px; }
      .jm-stat-label { font-size: 10px; color: #9c7e65; margin-bottom: 2px; }
      .jm-stat-val { font-weight: 700; color: #5a3e2b; }

      .jm-digest-box {
        background: #f9efe5;
        border: 1px dashed rgba(208, 145, 98, 0.45);
        border-radius: 11px;
        padding: 7px 10px;
        margin-bottom: 10px;
        font-size: 11px;
        color: #7d5d45;
      }
      .jm-digest-box.active { background: #fff4e6; border-color: rgba(226, 152, 84, 0.65); color: #965e2e; }
      .jm-digest-row { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
      .jm-digest-bar-bg { margin-top: 5px; height: 5px; background: rgba(215, 165, 120, 0.25); border-radius: 999px; overflow: hidden; display: none; }
      .jm-digest-box.active .jm-digest-bar-bg { display: block; }
      .jm-digest-bar-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #f2b76e, #dd854c); transition: width 0.5s linear; }

      .jm-bar-wrap { margin-bottom: 11px; }
      .jm-bar-top { display: flex; justify-content: space-between; font-size: 11px; color: #8f7058; margin-bottom: 4px; }
      .jm-bar-bg { height: 7px; background: #f0e2d5; border-radius: 999px; overflow: hidden; }
      .jm-bar-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #f2c078, #dc8865); transition: width 0.35s ease; }

      .jm-actions { display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; }
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
      .jm-btn:hover { background: #fff4e8; border-color: #d68b67; transform: translateY(-1px); }
      .jm-btn:active { transform: scale(0.96); }
      .jm-btn.jm-dimmed { opacity: 0.55; }
      .jm-btn-primary { background: linear-gradient(135deg, #e7a36f, #d47f64); color: #fff; border: none; }
      .jm-btn-primary:hover { background: linear-gradient(135deg, #dc935d, #c67056); color: #fff; }

      .jm-tip { margin-top: 8px; font-size: 10px; color: #b0927b; text-align: center; }

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
      .jm-link-btn { background: none; border: none; color: #a6866e; cursor: pointer; padding: 0; font-size: 10.5px; }
      .jm-link-btn:hover { color: #d47f64; text-decoration: underline; }

      .jm-dog-svg { width: 100%; height: 100%; overflow: visible; }
      .jm-tail { transform-origin: 39px 96px; animation: jm-wag 1.5s ease-in-out infinite; }
      .jm-tail-fast { animation-duration: 0.32s; }
      .jm-tail-slow { animation-duration: 3.2s; }
      .jm-tail-sleep { animation: none; transform: rotate(-5deg); }

      .jm-heart-float {
        transform-origin: 70px 32px;
        animation: jm-heart-drift 1.2s cubic-bezier(0.25, 1, 0.5, 1) forwards;
      }

      .jm-z1 { animation: jm-zzz 2.4s ease-in-out infinite; }
      .jm-z2 { animation: jm-zzz 2.4s ease-in-out 0.6s infinite; }
      .jm-z3 { animation: jm-zzz 2.4s ease-in-out 1.2s infinite; }

      @keyframes jm-wag { 0%, 100% { transform: rotate(-6deg); } 50% { transform: rotate(18deg); } }
      @keyframes jm-breathe { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2.2px); } }
      @keyframes jm-squish { 0% { transform: scale(1, 1); } 30% { transform: scale(1.15, 0.85); } 65% { transform: scale(0.95, 1.05); } 100% { transform: scale(1, 1); } }
      @keyframes jm-heart-drift {
        0% { opacity: 0.5; transform: translateY(12px) scale(0.5); }
        35% { opacity: 1; transform: translateY(-6px) scale(1.15); }
        100% { opacity: 0; transform: translateY(-28px) scale(1.4); }
      }
      @keyframes jm-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.2); opacity: 0.7; } }
      @keyframes jm-zzz { 0% { opacity: 0.15; transform: translateY(3px); } 50% { opacity: 0.95; transform: translateY(-4px); } 100% { opacity: 0.15; transform: translateY(-9px); } }

      @media (max-width: 600px) {
        #jm-pet-root { right: 16px; bottom: 86px; }
        .jm-badge { width: 64px; height: 64px; }
        .jm-badge-svg-wrap { width: 56px; height: 56px; }
        .jm-panel {
          position: fixed;
          left: 50% !important;
          right: auto !important;
          top: auto !important;
          bottom: 90px !important;
          width: min(296px, calc(100vw - 28px));
          transform: translateX(-50%) scale(0.95);
        }
        #jm-pet-root.jm-open:not(.jm-dragging) .jm-panel { transform: translateX(-50%) scale(1); }
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
            <span class="jm-name" id="jm-name" title="点击修改名字"></span>
            <span style="font-size:11px;color:#b5947a;">✎</span>
          </div>
          <span class="jm-status-tag" id="jm-status-tag"></span>
        </div>

        <div class="jm-stage" id="jm-stage" title="摸摸头">
          <div class="jm-speech" id="jm-speech">汪！可以按住我到处溜达哦~</div>
          <div class="jm-stage-dog" id="jm-stage-dog"></div>
        </div>

        <div class="jm-stats">
          <div class="jm-stat-box">
            <div class="jm-stat-label">体重</div>
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

        <div class="jm-tip">✨ 按住小鸡毛可拖动，刷新页面回到原位</div>

        <div class="jm-footer-tools">
          <button class="jm-link-btn" id="jm-skip-digest">⏩ 4h消化</button>
          <button class="jm-link-btn" id="jm-toggle-sleep">🌙 睡觉</button>
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

    function setSpeech(text) { els.speech.textContent = text; }

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

      if (isDragging) els.badgePill.textContent = '🐾 飞起来啦';
      else if (sleeping) els.badgePill.textContent = '💤 睡觉中';
      else if (state.digestingJin > 0) els.badgePill.textContent = `⏳ ${state.weight.toFixed(1)}kg`;
      else els.badgePill.textContent = `${state.weight.toFixed(1)}kg`;

      els.badgeDot.classList.toggle('show', !sleeping && status.isHungry);

      els.weightVal.textContent = `${state.weight.toFixed(1)} kg`;
      els.fullnessVal.textContent = `${Math.round(state.fullness)}%`;
      els.barFill.style.width = `${Math.min(100, Math.max(0, state.fullness))}%`;

      updateDigestUI();

      const cantEatMore = sleeping || state.digestingJin >= MAX_MEAL_JIN;
      els.feedBtns.forEach((btn) => btn.classList.toggle('jm-dimmed', cantEatMore));

      els.toggleSleepBtn.textContent = sleeping
        ? (sleepTestToggle ? '☀️ 退出睡觉' : '☀️ 清醒')
        : '🌙 睡觉';

      if (customSpeech) setSpeech(customSpeech);
      else if (sleeping) setSpeech('呼噜呼噜…23点啦，早8点起床陪你们 💤');
      else if (state.digestingJin > 0 && mood === 'idle') setSpeech(`正在消化 ${state.digestingJin.toFixed(1)} 斤美食，4h后长肉~`);
      else if (status.isHungry && mood === 'idle') setSpeech('好久没来找我玩了，饿到肚子叫 🥺');
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
          '呼噜…轻轻摸摸头好安心，不要吵醒我 💤',
          '吧唧嘴…梦里在和小白抢鸡胸肉 💤',
          '晚安主人，明早 8 点见哦 💤'
        ];
        render(dreamLines[state.petCount % dreamLines.length]);
        return;
      }

      setTempMood('happy', 2000);
      triggerSquish();
      spawnFloat('❤️');
      const lines = [
        '呜呼~ 好舒服，小尾巴要摇断啦！',
        '贴贴！最喜欢你们来找我玩了 💖',
        '再多摸两下，我是最乖的小金毛！',
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
        render(`炫完${foodName}刚好 1 斤！4h消化完就长肉肉啦~`);
      } else {
        render(`啊呜！吃了${foodName}，还要等 4h 消化哦~`);
      }
    }

    let pointerDown = false;
    let hasMoved = false;
    let startX = 0, startY = 0;
    let startLeft = 0, startTop = 0;

    function getClientXY(e) {
      if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
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
        render('落地啦！换个新角落继续陪你们 💖');
        setTimeout(() => { hasMoved = false; }, 60);
      }
    }

    els.badge.addEventListener('mousedown', onDragStart);
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);

    els.badge.addEventListener('touchstart', onDragStart, { passive: true });
    window.addEventListener('touchmove', onDragMove, { passive: false });
    window.addEventListener('touchend', onDragEnd);

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

    root.addEventListener('mouseenter', () => {
      if (isDragging) return;
      clearTimeout(closeTimer);
      updatePanelDirection();
      root.classList.add('jm-open');
    });
    root.addEventListener('mouseleave', () => {
      closeTimer = setTimeout(() => { root.classList.remove('jm-open'); }, 260);
    });

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
      const newName = prompt('给你们的小狗起个名字吧：', state.name);
      if (newName && newName.trim()) {
        state.name = newName.trim().slice(0, 10);
        saveState(state);
        render(`汪！以后我就叫${state.name}啦~`);
      }
    });

    root.querySelector('#jm-skip-digest').addEventListener('click', () => {
      if (state.digestingJin <= 0) {
        render('先喂点吃的再测试消化变胖吧~');
        return;
      }
      state.digestEndTime = Date.now() - 1000;
      const done = syncStateWithClock(state);
      if (done) {
        setTempMood('happy', 2500);
        triggerSquish();
        spawnFloat('✨');
        render(`消化完毕！吸收 ${done.eatenJin.toFixed(1)} 斤，体重 +${done.actualGain.toFixed(2)}kg！`);
      }
    });

    els.toggleSleepBtn.addEventListener('click', () => {
      sleepTestToggle = !sleepTestToggle;
      mood = 'idle';
      render(isSleeping() ? '已切到夜间睡眠预览（23-08点自动生效）💤' : '切回白天清醒状态 ☀️');
    });

    root.querySelector('#jm-sim-starve').addEventListener('click', () => {
      const shiftMs = 72 * 3600 * 1000;
      state.lastVisit = Date.now() - shiftMs;
      if (state.digestEndTime) state.digestEndTime -= shiftMs;
      if (state.digestStartTime) state.digestStartTime -= shiftMs;
      mood = 'idle';
      syncStateWithClock(state);
      render('呜呜…三天没来看我，我都饿瘦了… 🥺');
    });

    root.querySelector('#jm-reset').addEventListener('click', () => {
      const keptName = state.name;
      sleepTestToggle = false;
      state = { ...DEFAULT_STATE, name: keptName, lastVisit: Date.now() };
      mood = 'idle';
      saveState(state);
      render('已恢复健康体型，重新开始养小狗吧！');
    });

    setInterval(() => {
      const nowSleeping = isSleeping();
      if (nowSleeping !== lastSleepFlag) {
        lastSleepFlag = nowSleeping;
        render(nowSleeping ? '到晚上 11 点啦，小狗晚安 💤' : '早安！8 点起床啦，肚子好饿~');
        return;
      }

      if (state.digestingJin > 0) {
        if (Date.now() >= state.digestEndTime) {
          const done = syncStateWithClock(state);
          if (done) {
            setTempMood('happy', 2500);
            triggerSquish();
            spawnFloat('✨');
            render(`消化完成！吸收 ${done.eatenJin.toFixed(1)} 斤美食，长胖 ${done.actualGain.toFixed(2)}kg！`);
          }
        } else {
          updateDigestUI();
        }
      }
    }, 1000);

    if (initDigested) {
      render(`你不在的时候我消化完 ${initDigested.eatenJin.toFixed(1)} 斤，体重 +${initDigested.actualGain.toFixed(2)}kg！`);
    } else {
      render();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
