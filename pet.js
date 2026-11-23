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

  // 线条小狗 · 小鸡毛 SVG（无内部断线的一体团子轮廓 + 红项圈 + 头顶红心）
  function buildXiaoJiMaoSVG(state, mood, dangling = false) {
    const sleeping = isSleeping() && !dangling;
    const status = getBodyStatus(state);
    const isHappy = !sleeping && !dangling && (mood === 'happy' || mood === 'eating');
    const isHungry = !sleeping && !dangling && status.isHungry && mood === 'idle';

    // 体重 4.5 ~ 24.0 kg 映射到身体胖瘦比例
    const ratio = (state.weight - 4.5) / (24.0 - 4.5);
    const bodyScaleX = +(0.78 + ratio * 0.54).toFixed(3);
    const bodyScaleY = +(0.94 + ratio * 0.14).toFixed(3);
    const headScaleX = +(0.95 + ratio * 0.14).toFixed(3);
    const headScaleY = +(0.97 + ratio * 0.06).toFixed(3);
    const shadowRx = +(24 + ratio * 18).toFixed(1);

    const strokeColor = '#1e1611';
    const furColor = '#e3c796';
    const collarColor = '#ff6f61';
    const heartColor = '#ff6f61';

    let eyesMarkup = `
      <circle cx="59" cy="56" r="2.2" fill="${strokeColor}"/>
      <circle cx="81" cy="56" r="2.2" fill="${strokeColor}"/>
    `;
    if (dangling) {
      eyesMarkup = `
        <circle cx="58.5" cy="56" r="3.1" fill="#ffffff" stroke="${strokeColor}" stroke-width="2"/>
        <circle cx="58.5" cy="56" r="1.2" fill="${strokeColor}"/>
        <circle cx="81.5" cy="56" r="3.1" fill="#ffffff" stroke="${strokeColor}" stroke-width="2"/>
        <circle cx="81.5" cy="56" r="1.2" fill="${strokeColor}"/>
      `;
    } else if (sleeping) {
      eyesMarkup = `
        <path d="M55,56 Q59,60 63,56" fill="none" stroke="${strokeColor}" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M77,56 Q81,60 85,56" fill="none" stroke="${strokeColor}" stroke-width="2.4" stroke-linecap="round"/>
      `;
    } else if (isHappy) {
      eyesMarkup = `
        <path d="M55,57 Q59,52 63,57" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M77,57 Q81,52 85,57" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round"/>
      `;
    } else if (isHungry) {
      eyesMarkup = `
        <circle cx="59" cy="56.5" r="2.3" fill="${strokeColor}"/>
        <circle cx="81" cy="56.5" r="2.3" fill="${strokeColor}"/>
        <ellipse cx="56.5" cy="60.5" rx="1.4" ry="2" fill="#8fd0f4"/>
        <ellipse cx="83.5" cy="60.5" rx="1.4" ry="2" fill="#8fd0f4"/>
        <path d="M55,51.5 L62,53" stroke="${strokeColor}" stroke-width="1.7" stroke-linecap="round"/>
        <path d="M85,51.5 L78,53" stroke="${strokeColor}" stroke-width="1.7" stroke-linecap="round"/>
      `;
    }

    let mouthMarkup = `
      <circle cx="70" cy="57" r="2.2" fill="${strokeColor}"/>
      <line x1="70" y1="57" x2="70" y2="61.5" stroke="${strokeColor}" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M60,61.5 Q65,66.5 70,61.5 Q75,66.5 80,61.5" fill="none" stroke="${strokeColor}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    `;
    if (dangling) {
      mouthMarkup = `
        <circle cx="70" cy="56.5" r="2.1" fill="${strokeColor}"/>
        <ellipse cx="7
