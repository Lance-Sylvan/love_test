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
  function petGirth(weight) {
    return Math.max(0.91, Math.min(1.15, 1 + (weight - DEFAULT_STATE.weight) * 0.013));
  }

  function buildXiaoJiMaoSVG(state, mood, dangling, heart) {
    const sleeping = !dangling && isSleeping();
    const happy = !sleeping && !dangling && mood === 'happy';
    const eating = !sleeping && !dangling && mood === 'eating';
    const hungry = !heart && !sleeping && !dangling && mood === 'idle' && getBodyStatus(state).isHungry;
    const fur = '#e4cca1';
    const ink = '#171411';
    const coral = '#fd7869';

    // 正常体重对应参考图。胖瘦只改变躯干和尾巴，脸与爱心保持原比例。
    const girth = petGirth(state.weight);
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
        <path visibility="${heart ? 'visible' : 'hidden'}" class="${heartClass}" fill="${coral}"
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

  const createPetPainter = (() => {
  const bound = (v, a, b) => Math.max(a, Math.min(b, v));
  const unit = v => bound(v, 0, 1);
  const ease = t => { const n = unit(t); return n*n*(3-2*n); };
  const blend = (a, b, t) => a + (b-a)*t;
  const rnd = (a, b) => blend(a, b, Math.random());
  const num = v => Math.round(v*100)/100;
  const pairs = s => s.trim().split(/\s+/).map(p => p.split(',').map(Number));
  const tau = Math.PI*2;

  const point = p => num(p[0])+' '+num(p[1]);

  // Each silhouette follows the same landmarks, so the lines stay attached between drawings.
  // The top of the head runs from the left cheek, around both ears, to the right cheek.
  const heads = {
    front: ['35,48 32.6,45 32.4,41.4 33.4,38 31.4,38.1 29.1,36.3 29.7,32.3 33.6,28.4 40.3,27.9 51,25.6 61,27.8 65.3,27.1 70,29.6 72.7,33.8 72.6,37.4 70.4,39.2 68.2,39 68.7,43.6 66.1,47.8', [50.35,37.4,0], [37,30.1,38.8,28.8], [62.4,29.2,63.3,30.4], [66.7,36.1,65.6,33.7], 4.6],
    down: ['33.4,47.6 29.6,45.2 28.8,40.2 31.4,35.7 33.5,32.6 32.8,30.2 35,26.9 39.8,24.3 45.4,25.8 52.4,24.7 58.1,25.8 62.3,25 68.8,24.3 73.1,26.4 74.7,30.3 72.8,34.5 66.4,36.3 67,39.5 66.1,43.5', [45.7,38.5,-4.2], [37,28,41,25.7], [59.6,26.6,60.8,27.6], [65.6,33.7,64.4,31.5], 4.7],
    flying: ['32.1,46.7 28.7,44.5 27.6,39 30.4,34.1 33.7,30.5 35.4,25.4 39.3,20.6 45.6,19.2 48.2,23.2 53.3,23.6 57.6,24.8 64.9,20.6 71.4,18.2 75.7,21.5 75.8,26.4 71.2,31.2 65.3,33.4 66.55,37.2 66.6,41.7', [44.2,37.6,-6.1], [38.5,25.5,43.4,23.6], [59,25.5,60.35,26.2], [64.3,31.8,62.9,30.1], 4.7],
    flick: ['32.5,46.2 29,43.9 28.5,38.4 30.6,34.2 34.1,30 35.6,24.5 39.5,19.7 43.9,18.1 47.5,22.7 53.6,23.1 58.4,24.1 63.7,18.7 69.3,15.8 74.5,18.1 75.4,22.2 71.2,28.7 65.7,32.4 67.0,37.2 66.4,42.1', [45.1,37.2,-5.3], [38.5,25.3,43.2,23.1], [59.7,24.8,60.7,25.6], [64.1,30.7,63,28.9], 4.55]
  };
  // The right and left hands finish around the waist, well above the feet.
  const hands = {
    rest:['68.8,47.9 72.3,47 75,48.6 74.1,51.8 68.4,55.3','35,54.8 31.4,53.1 28.2,50 28.7,47.5 32.1,47'],
    gather:['67.4,46.1 70.7,45.8 73.1,47.7 72.2,50.1 67,53.7','35.5,54.3 31.8,54 29.6,51.6 30.4,49.2 32,47.8'],
    split:['70.1,42.2 73.3,43.8 73.8,46 71.7,47.9 68.4,49.9','34.75,54.4 31.7,54.8 28.5,54.2 27.85,51.7 29.1,49.4'],
    drive:['69.5,43.4 73.9,44.6 75,46.7 73.1,49.4 68.2,51.3','35.2,54.8 31.1,52.7 27.4,49.8 27.5,47.4 30.1,46.2'],
    swing:['68.1,44.4 70.8,48.1 70.5,51.3 68.2,53.1 65.9,53.3','35.1,52.4 30,50.5 25.8,46.6 25.4,43.7 28.1,43.5'],
    brake:['67.4,46.6 72.9,47.9 75.1,50.5 74,53 68.3,53.7','35.8,52.9 31.2,51.4 26.3,47.2 26.6,44.7 30.3,44.5'],
    waveUp:['69.4,46.8 74.2,41.9 78.1,40.75 79.55,43.15 69.2,54.4','34,55.4 31,54.2 29,52.5 29.3,50 32.8,49'],
    waveIn:['68.7,46.9 71,41.7 74.1,39 76.7,40.45 69.65,54.7','34.9,55.3 32,54.9 30.1,52.6 30.2,50.3 32.8,49.3'],
    wide:['70.4,46.8 76.3,44.6 79.2,45.6 78.7,48.4 69,53.5','34.4,53.3 29.1,51.6 24.7,47.8 25.2,45.2 30.1,45.8'],
    tuck:['68.2,47.5 71.5,46.3 73,48.2 71.8,51.5 67.8,54.1','35.2,54.7 31.1,53.5 28.7,51.1 29.65,48.6 32.6,48.2']
  };
  // Two continuous, rounded feet. On the split leap one sole turns toward the viewer.
  const legs = {
    stand:'68,57.1 67.7,62.2 67.3,67.3 66.4,70.3 63.7,70.6 60.8,68.8 48,68.2 40.9,68.7 38.35,70.55 35.8,70.4 35,66.2 35,58',
    crouch:'68.2,56.4 68.3,62.3 70,66.9 69.5,69.6 65.9,70.3 61.3,68.8 52.3,68.3 45.6,69.4 41.4,70.8 37.6,70.2 35.6,65.6 35.4,58.3',
    plantA:'68.2,55.9 67.8,60.1 68.4,63.1 67.6,65.7 64.8,66.3 60.2,65.2 51.8,66.9 44.4,70.6 40.3,71 37.9,68.9 36.9,64.1 35.5,58',
    pushA:'67.8,55.2 67.7,59.8 70.8,61.3 70.7,63.5 67.6,65 63.6,64.5 55.8,66.8 52.2,70.7 48.1,70.9 45,69.4 40.2,64.9 35.8,57.6',
    skyA:'68,53.6 67.95,59.05 67.7,61.15 66,63.5 63.2,64.9 59.7,66.35 56.2,67.85 54.3,70.1 51.8,70.4 48.25,69.15 43.1,65.15 36,56.5',
    reachB:'67.2,54.4 66.3,59.4 64.8,64.5 62.8,69.7 59.7,70.9 56.7,69.1 52.3,66.05 47.7,65.2 44.1,64.3 40.8,61.8 37.8,59.3 35.55,55.5',
    plantB:'66.8,55 65.2,60 64.3,65.4 63,70.55 59.5,70.95 56.1,68.2 51.6,65.2 46.5,64.2 42.6,64.9 39.1,63.6 36.2,60.1 35.7,56.1',
    pushB:'66.6,54.9 67.2,59.2 69.4,64.3 69.7,69.5 67.2,70.9 62.3,68.8 55.2,66.3 48.7,64.4 43.3,62.2 39.8,60.4 37.5,58.7 35.9,55.4',
    skyB:'66.9,54.95 68.5,58.55 72.8,55.1 75.35,56.1 75.65,59.1 69.2,64.35 62.3,66.6 54.9,67.35 49.2,66.25 43.5,63.5 39.4,59.9 36.0,55.7',
    skid:'68.8,57.4 69.6,62.3 71.5,65.6 71.8,68.7 68.4,70.1 64,69 54.7,68.6 47.65,69.35 42.3,70.9 37.4,70.8 36.1,68.7 37.1,61.6',
    knees:'67.3,56 67.4,61 69.1,64.2 70.4,65.4 69.6,67.3 65.7,68 55,66.4 47.9,66.8 44.8,68.8 42.3,68.2 40.2,65.4 36.5,57.3',
    kick:'67.7,55.2 68.1,58.8 72.9,57.5 75.2,58.5 74.5,61.8 68.1,66 51.4,67.8 43.3,68.6 39.8,70.7 36.5,70.4 35.5,66.3 35,57.6'
  };
  const soles = {
    none:['52,65 52,65 52,65 52,65',0], tucked:['57.2,64.3 55.5,61.3 56.55,58.65 58.55,59.15',1],
    low:['56.7,66.5 55.7,64.7 57.3,63.65 58.85,64.1',.73], other:['45.4,62.7 42,60.8 41.6,58.2 43.75,57.55',.95]
  };
  for (const a of Object.values(heads)) a[0] = pairs(a[0]);
  for (const a of Object.values(hands)) { a[0]=pairs(a[0]); a[1]=pairs(a[1]); }
  for (const k of Object.keys(legs)) legs[k]=pairs(legs[k]);
  for (const a of Object.values(soles)) a[0]=pairs(a[0]);

  function drawing(h, ar, le, foot, options={}) {
    const head = heads[h], arm=hands[ar], leg=legs[le], sole=soles[foot];
    const {dx=0,dy=0,tilt=0,rise=0,sx=1,sy=1,tail=1,tailY=0,happy=0,blush=0,gaze=0}=options;
    const rad=tilt*Math.PI/180, cos=Math.cos(rad), sin=Math.sin(rad);
    const at = (a,b) => [51+dx+(a-51)*cos-(b-45)*sin, 45+dy+(a-51)*sin+(b-45)*cos];
    const headPoints=head[0].map(p => at(...p));
    const armRight=arm[0].map(([a,b],i)=>[a+dx*(5-i)/9,b+dy*(5-i)/8]);
    const armLeft=arm[1].map(([a,b],i)=>[a+dx*(i+1)/9,b+dy*(i+1)/8]);
    const ring=[...headPoints,...armRight,...leg,...armLeft];
    const face=head[1];
    const far=head[2], top=head[3], near=head[4];
    const left=head[0][0],right=head[0][18],depth=head[5];
    const line = [
      headPoints[4],at(far[0],far[1]),at(far[2],far[3]),headPoints[8],
      headPoints[10],at(top[0],top[1]),at(top[2],top[3]),
      headPoints[16],at(near[0],near[1]),at(near[2],near[3]),
      at(left[0]+.9,left[1]+.35),at(left[0]+8,left[1]+depth),at(right[0]-12,right[1]+depth+1.7),at(right[0]-.75,right[1]+.75),
      ...sole[0]
    ];
    const tx=leg[1][0]-1.3,ty=leg[1][1]+1.4;
    const tailPoints=[[tx-2,ty-1],[tx+2.3,ty-1],[tx+3+tail*3.8,ty-1.2+tailY],[tx+4+tail*4.1,ty+.4+tailY],
      [tx+2+tail*2.8,ty+2.4+tailY*.7],[tx-2,ty+2.9]];
    const fc=at(face[0]+gaze,face[1]);
    return [...ring.flat(),...line.flat(),...tailPoints.flat(),fc[0],fc[1],face[2]+tilt,rise,sx,sy,sole[1],happy,blush];
  }
  const D = {
    idle:drawing('front','rest','stand','none',{tail:.35}),
    peek:drawing('front','gather','stand','none',{tilt:-5.5,dx:-.9,dy:-.25,gaze:-1.25,tail:.48,tailY:-1}),
    preload:drawing('down','gather','crouch','low',{dx:-.4,dy:1.55,sx:1.045,sy:.915,tail:.52,tailY:1.3}),
    contactA:drawing('down','drive','plantA','low',{dx:-.6,dy:.65,tail:.69,tailY:.8}),
    pushA:drawing('down','drive','pushA','tucked',{dx:-.65,dy:-.8,sx:.977,sy:1.03,tail:.87,tailY:-1.2}),
    springA:drawing('flying','split','skyA','tucked',{dx:-.55,dy:-.4,rise:5.9,sx:.993,sy:1.015,tail:1.02,tailY:-1.3}),
    flyA:drawing('flying','split','skyA','tucked',{rise:8.7}),
    fallA:drawing('flick','drive','reachB','low',{rise:4.55,tilt:1.2,tail:.78,tailY:.85}),
    contactB:drawing('down','swing','plantB','low',{dx:-.8,dy:.6,sx:1.01,tail:.63,tailY:1.4}),
    squashB:drawing('down','swing','plantB','low',{dx:-.7,dy:1.6,tilt:-.6,sx:1.05,sy:.906,tail:.51,tailY:1}),
    pushB:drawing('down','swing','pushB','other',{dx:-.15,dy:-1.2,tilt:.7,sx:.97,sy:1.038,tail:.6,tailY:-1}),
    springB:drawing('flying','swing','skyB','other',{dx:-.4,dy:-.5,rise:5.2,sx:.985,sy:1.025,tail:.42,tailY:-2.65}),
    flyB:drawing('flying','swing','skyB','other',{dx:.15,dy:.1,tilt:1,rise:7.65,tail:.31,tailY:-3.2}),
    fallB:drawing('flick','drive','plantA','low',{dx:.5,dy:.1,tilt:1.6,rise:4,tail:.63,tailY:1.5}),
    squashA:drawing('down','drive','plantA','low',{dy:1.4,dx:-.7,sx:1.047,sy:.912,tail:.66,tailY:.9}),
    skid:drawing('down','brake','skid','none',{dx:2.1,dy:1.6,tilt:7.5,sx:1.055,sy:.93,tail:.66,tailY:1.65}),
    recoil:drawing('front','gather','stand','none',{dx:.65,dy:-.3,tilt:3.3,sx:.985,sy:1.023,tail:.57,tailY:-2}),
    waveUp:drawing('front','waveUp','stand','none',{dx:-.8,dy:.4,tilt:-5,tail:.67,tailY:-1.6,gaze:.2}),
    waveIn:drawing('front','waveIn','stand','none',{dx:.35,dy:.6,tilt:-2.4,tail:.7,tailY:1.6,gaze:.2}),
    wind:drawing('front','gather','crouch','none',{dx:1.2,dy:1.3,tilt:5.2,sx:1.035,sy:.944,tail:.6}),
    danceL:drawing('front','wide','kick','none',{dx:-2,dy:.5,tilt:-7,tail:.65,tailY:-2.8,happy:1,blush:.45}),
    danceR:drawing('front','wide','stand','none',{dx:2,dy:.5,tilt:7,sx:1.02,sy:.956,tail:.45,tailY:1.35,happy:1,blush:.45}),
    jump:drawing('front','wide','knees','none',{dy:-.6,tilt:-3,rise:7.7,sx:.987,sy:1.026,tail:.65,tailY:-2,happy:1,blush:.6}),
    nuzzle:drawing('front','tuck','crouch','none',{dx:-.6,dy:1.2,tilt:-6,sx:1.03,sy:.952,tail:.7,tailY:-2.4,happy:1,blush:.83}),
    nuzzleUp:drawing('front','wide','knees','none',{dx:.4,dy:-.4,tilt:2,rise:3.3,sx:.99,sy:1.02,tail:.72,tailY:1.4,happy:1,blush:.88}),
    held:drawing('front','wide','knees','none',{dy:-.3,tilt:-4,sx:.98,sy:1.04,tail:.65,tailY:-2.3})
  };

  function between(a,b,t) {
    if (t<=0) return a;
    if (t>=1) return b;
    return a.map((v,i)=>blend(v,b[i],t));
  }
  function sequence(keys,t) {
    if (t<=keys[0][0]) return D[keys[0][1]];
    for (let i=1;i<keys.length;i++) {
      const [end,name]=keys[i], [start,prev]=keys[i-1];
      if (t<=end) {
        const u=unit((t-start)/(end-start));
        return between(D[prev],D[name],blend(u,ease(u),.63));
      }
    }
    return D[keys[keys.length-1][1]];
  }
  const poses = {
    look:[[0,'idle'],[.29,'idle'],[.49,'peek'],[.79,'peek'],[1,'idle']],
    ready:[[0,'idle'],[.18,'idle'],[.52,'preload'],[.68,'preload'],[1,'contactA']],
    A:[[0,'contactA'],[.13,'squashA'],[.29,'pushA'],[.43,'springA'],[.53,'flyA'],[.65,'flyA'],[.82,'fallA'],[1,'contactB']],
    B:[[0,'contactB'],[.15,'squashB'],[.30,'pushB'],[.45,'springB'],[.55,'flyB'],[.63,'flyB'],[.83,'fallB'],[1,'contactA']],
    brakeA:[[0,'contactA'],[.28,'skid'],[.48,'skid'],[.70,'recoil'],[1,'idle']],
    brakeB:[[0,'contactB'],[.28,'skid'],[.48,'skid'],[.70,'recoil'],[1,'idle']],
    wave:[[0,'idle'],[.16,'peek'],[.28,'waveUp'],[.38,'waveIn'],[.48,'waveUp'],[.58,'waveIn'],[.69,'waveUp'],[.78,'waveUp'],[.9,'recoil'],[1,'idle']],
    dance:[[0,'idle'],[.14,'wind'],[.28,'danceL'],[.40,'danceR'],[.52,'danceL'],[.65,'danceR'],[.79,'danceL'],[.9,'recoil'],[1,'idle']],
    hops:[[0,'idle'],[.13,'wind'],[.29,'jump'],[.34,'jump'],[.47,'wind'],[.59,'jump'],[.66,'jump'],[.8,'wind'],[.91,'recoil'],[1,'idle']],
    pet:[[0,'idle'],[.15,'nuzzle'],[.3,'nuzzleUp'],[.43,'nuzzle'],[.56,'nuzzleUp'],[.68,'nuzzle'],[.85,'nuzzle'],[1,'idle']],
    land:[[0,'held'],[.42,'held'],[.58,'preload'],[.77,'recoil'],[1,'idle']]
  };
  // Short handles at an ear root or a wrist preserve the little corners of the ink line.
  const corners=new Map([[0,.62],[4,.40],[8,.31],[10,.34],[16,.43],[18,.39],[23,.37],[30,.6],[36,.36]]);
  function curve(points,closed,edged=false) {
    const count=points.length;
    const get=i=>closed?points[(i+count)%count]:points[bound(i,0,count-1)];
    const tangent=i=>{
      const a=get(i-1), b=get(i+1);
      const dx=b[0]-a[0],dy=b[1]-a[1],d=Math.hypot(dx,dy)||1;
      const k=edged?(corners.get(i)??1):1;
      return [k*dx/d,k*dy/d];
    };
    const dirs=points.map((_p,i)=>tangent(i));
    let s='M'+point(points[0]);
    for(let i=0;i<(closed?count:count-1);i++) {
      const j=(i+1)%count,a=points[i],b=points[j],dist=Math.hypot(b[0]-a[0],b[1]-a[1])*.348;
      s+='C'+point([a[0]+dirs[i][0]*dist,a[1]+dirs[i][1]*dist])+' '+
        point([b[0]-dirs[j][0]*dist,b[1]-dirs[j][1]*dist])+' '+point(b);
    }
    return s+(closed?'Z':'');
  }
  const arms = {
    rest:[32.5,62.6,26.8,61,26.5,58.5,26.3,55.8,29.2,56.1,32.1,56.6,34.1,59.3],
    cheek:[32,62,28.9,60.6,31.7,55.7,34.4,50.4,36.7,51.6,40.1,53.4,35,58.9],
    mouth:[32,62.8,31.1,59.6,34.2,56.6,39.5,51,41.6,53.2,43.6,55.8,35.2,60.4],
    wave:[32.1,62.5,26.7,60.1,24.4,55.3,22.5,51.4,25.4,50.7,28.1,50.4,34.1,59.1],
    low:[32.3,62.6,30.4,64.4,28.9,63.1,26.8,61,28.3,58.9,29.6,57.5,33.7,59.3]
  };
  const restBelly="M35 54.8Q46 50.5 57.2 55.2C61.7 58.1 63 64.7 62 69.9Q61.7 72.7 60.7 74.6C60.9 77.5 59.9 79.4 58.1 79Q56.5 79 55.8 77.1C50 78.5 41.6 78.45 36.4 77.1Q35.25 79.4 33.4 79C31.65 78.9 31.1 77.2 31.45 74.75C28.2 67.1 29.5 58.9 35 54.8Z";
  const firstBelly="M32.2 57.55c-2.35-1.85-5.55-2.3-6.66-.36-1.35 2.3.55 4.05 2.57 5.78 .83.72 1.05 1.22 1.02 2.55-.12 2.92.17 6.6.75 11.38 .12 1.79 1.91 2.65 3.42 1.23.88-.86 1.48-1.04 2.92-1.19 5.62-.82 12.72-1.12 19.07-.24 1.05.06 1.44.38 1.86 1.03 .94 1.4 3.37 1.18 3.8-.48.28-4.24 1.56-9.05 1.6-12.8 .02-1.02.42-1.47 1.36-2.08 1.61-1.11 3.92-2.48 3.58-4.39 -.43-2.5-3.97-2.95-7.38-.59 Q47.6 49.55 32.2 57.55z";

    const markup = `<svg class="jm-dog-svg" viewBox="20 0 64 82" focusable="false" aria-hidden="true" fill="#e9cc9c" stroke="#17130f" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <ellipse data-part="shadow" cx="51" cy="76.7" rx="16.4" ry="1.85" fill="#a48766" stroke="none" opacity=".2"/>
        <g data-part="facing" opacity="0">
          <g data-part="dust" fill="none" stroke="#d8b788" stroke-width="1.25" opacity="0">
            <path d="M0 0q1.5-3.7 4.8-2.3q2.4-3.6 5.6-1.8q2.6-.8 4.8 1.8M4.8-2.1q1.2-.9 2.2-1M10.2-.4q3.7.6 5.3-.7M18.4-4.9l1.2-.6"/>
          </g>
          <g data-part="figure">
            <path data-part="tail" d="M65 57q7-2 8 .6q.6 2.5-7.9 3.3Z"/>
            <path data-part="outline" d="M32 47C24 42 28 35 34 30C36 19 44 15 48 23Q54 23 58 25C66 18 73 15 76 22Q80 27 65 34Q68 38 67 42Q79 44 68 50L68 58Q70 64 57 68Q53 76 43 65L35 55Q24 57 29 49Z"/>
            <path data-part="farFold" d="M34 30Q39 23.2 48 23" fill="none"/>
            <path data-part="topFold" d="M57.7 24.8l2.4 1.2" fill="none"/>
            <path data-part="nearFold" d="M65.1 33.4q-1.2-2.3-2.7-3.5" fill="none"/>
            <path data-part="collar" d="M33.8 47.2C43 51.1 56 47.8 65.9 42.4" stroke="#fa8972" stroke-width="1.7" fill="none"/>
            <path data-part="curl" d="M57.2 64.3q-3.2-4-.5-5.6q1.2-.7 2.3.7" stroke-width="1.55" fill="none"/>
            <g data-part="face" transform="translate(44 38.2) rotate(-6)" fill="#18130f" stroke="none">
              <g data-part="eyes">
                <ellipse cx="-6.5" cy="-.2" rx="1.05" ry="1.12"/>
                <ellipse cx="7.3" cy="-.3" rx="1.13" ry="1.13"/>
              </g>
              <path data-part="happyEyes" d="M-8 .3Q-6.7-2.2-5.3.2M5.9.05Q7.35-2.15 8.75.05" fill="none" stroke="#18130f" stroke-width="1.24" opacity="0"/>
              <path d="M-1.43-.31C-1.33-1.45 1.19-1.49 1.47-.48C1.6.21.85 1.18.05 1.5C-.68 1.25-1.57.48-1.43-.31Z"/>
              <path data-part="mouth" d="M.05 1.2L0 2.45M-5.8 3.45C-5.2 4.65-1.35 4.38 0 2.45C1.15 3.88 4.75 4.06 6.25 3.06" fill="none" stroke="#18130f" stroke-width="1.25"/>
              <path data-part="blush" d="M-12 3.7l2.8.1m17.4-.2L11 3.2" stroke="#ed967b" stroke-width="1.55" opacity="0"/>
            </g>
          </g>
        </g>
<g data-part="portrait" transform="translate(51.5 76) scale(1.07) translate(-46 -79)" fill="#e9cc9c" stroke="#211912" stroke-width="1.55">
  <g data-part="littleTail"><path d="M32 69q-4.3-2.4-5.3.2c-.8 2.2 2.3 3.4 5.7 2.2z"/></g>
  <path data-part="belly" d="M35 54.8Q46 50.5 57.2 55.2C61.7 58.1 63 64.7 62 69.9Q61.7 72.7 60.7 74.6C60.9 77.5 59.9 79.4 58.1 79Q56.5 79 55.8 77.1C50 78.5 41.6 78.45 36.4 77.1Q35.25 79.4 33.4 79C31.65 78.9 31.1 77.2 31.45 74.75C28.2 67.1 29.5 58.9 35 54.8Z"/>
  <g data-part="littleHead">
   <path d="M32.2 57.7c-2.65-1.6-3.35-5.68-1.42-10.12-2.15-.04-3.73-2.04-2.55-5.08 1.34-3.3 5.05-6.8 10.15-4.72 4.45-2.89 10.95-2.9 15.93.14 3.64-2.54 8.05.03 10.24 3.95 2.27 4.35-.43 7.2-2.92 7.24.85 3.65.19 6.72-2.1 8.78"/>
   <path fill="none" d="M38.38 37.78q-.96.6-1.64 1.53 M54.31 37.92l.85 1.12 M30.78 47.58q1.1-2.55 2.5-3.95 M61.63 49.11q-2.24-2.63-3.29-5.43"/>
   <path d="M32.7 57.85C39.6 60.1 52.7 60.35 59.2 57.96" stroke="#f58a76" stroke-width="1.7" fill="none"/>
   <g data-part="littleFace">
    <g data-part="dots" fill="#211912" stroke="none"><circle cx="39.85" cy="46.1" r="1.12"/><circle cx="52.15" cy="46" r="1.12"/></g>
    <path data-part="lids" opacity="0" d="M38.25 46.45q1.6 1.5 3.2 0m9.05-.12q1.7 1.6 3.45 0" fill="none" stroke-width="1.12"/>
    <path d="M44.8 46q.1-.87 1.36-.86 1.2-.06 1.42.72.1.83-1.34 1.63-1.33-.72-1.44-1.5z" fill="#211912" stroke="none"/>
    <path data-part="littleSmile" d="M46.2 47.1v1.3m-6.4.3c.8 2.2 5 2.15 6.4-.23 1.4 2.08 5.3 2.22 6.5-.08" fill="none" stroke-width="1.24"/>
    <ellipse data-part="oh" cx="46.25" cy="50.2" rx="1.55" ry="1.65" fill="#f79c88" stroke-width="1.2" opacity="0"/>
    <g data-part="cheeks" fill="#ef9d92" stroke="none" opacity=".28"><ellipse cx="35.7" cy="49.4" rx="2.35" ry="1.15"/><ellipse cx="56.8" cy="49.2" rx="2.4" ry="1.15"/></g>
   </g>
  </g>
  <path data-part="armL" d="M32.5 62.6Q26.8 61 26.5 58.5Q26.3 55.8 29.2 56.1Q32.1 56.6 34.1 59.3"/>
  <path data-part="armR" d="M59.7 62.6Q65.1 61.3 65.9 58.4Q66.1 55.8 63.2 56.2Q60.6 56.5 58.3 59.2"/>
</g>
</svg>`;
    return function createPainter(host) {
      host.innerHTML = markup;
      const part=Object.fromEntries(Array.from(host.querySelectorAll('[data-part]'),el=>[el.dataset.part,el]));
      const attr=(key,name,value)=>part[key].setAttribute(name,value);
      const drawPath=(key,points,closed=false,edged=false)=>attr(key,'d',curve(points,closed,edged));
      let mode='quiet',age=0,now=0,blinkAge=1;
      const dragUp=0, strides=4, period=.48;
  function mitten(key,shape,amount,mirror,jiggle) {
    const coords=arms.rest.map((v,i)=>{
      const interior=i>=4 && i<10;
      const p=blend(v,arms[shape][i],amount)+(i%2 && interior ? jiggle:0);
      return num(mirror && !(i%2)?92.4-p:p);
    });
    let d='M'+coords[0]+' '+coords[1];
    for(let i=2;i<coords.length;i+=4) d+='Q'+coords.slice(i,i+4).join(' ');
    attr(key,'d',d);
  }
  function paintPortrait(t) {
    const env=ease(t/.20)*(1-ease((t-.76)/.24));
    const weight=name=>mode===name?env:0;
    const shy=weight('shy'),yawn=weight('yawn'),listen=weight('listen'),wave=weight('wave'),pet=weight('pet');
    const flying=mode==='held',landing=mode==='land';
    const swing=Math.sin(now*5.3),bounce=landing?Math.sin(Math.PI*unit((t-.45)/.55))*.095:0;
    const stretch=mode==='quiet'?1:flying?1.02:1+Math.sin(now*2.6)*.012-bounce;
    const angle=flying?-5+2.4*swing:landing?-5*(1-ease(t/.56)):0;
    const nod=shy*(4+2*Math.sin(age*8))+listen*(-10+2*swing)-yawn*6+pet*(4+3*swing);
    attr('portrait','transform','translate(51.5 '+num(76-dragUp)+') scale(1.07) translate(-46 -79) translate(46 79) scale('+num(1+bounce*.55)+' '+stretch.toFixed(3)+') translate(-46 -79) rotate('+num(angle)+' 46 37)');
    attr('littleHead','transform','translate(46 58) scale('+(flying?'1':'1.035 1.025')+') translate(-46 -58) rotate('+num(nod)+' 46 58) translate(0 '+num(shy*.7-yawn*.7)+')');
    attr('littleFace','transform','translate('+num(-listen*1.3)+' '+num(yawn*.55)+')');
    const shut=mode==='quiet'?0:Math.max(shy*.91,yawn,pet,blinkAge<.19?Math.sin(Math.PI*blinkAge/.19):0)*(flying?0:1);
    attr('dots','opacity',num(1-shut));attr('lids','opacity',num(shut));
    attr('dots','transform','translate(46 46) scale('+(flying?1.19:1)+' '+num(flying?1.19:1-.73*shut)+') translate(-46 -46)');
    const opened=flying?1:Math.max(yawn,landing?1-ease(t/.55):0);
    attr('oh','opacity',num(opened));attr('oh','ry',num(1.65+1.15*yawn));
    attr('littleSmile','opacity',num(1-opened));attr('cheeks','opacity',num(.22+shy*.67+pet*.48));
    const tick=mode==='quiet'?0:(flying?21:shy?12:6)*Math.sin(now*(flying?15.7:pet?12:4.1));
    attr('littleTail','transform','rotate('+num(tick)+' 32 70)');
    attr('belly','d',flying?firstBelly:restBelly);
    for(const k of ['armL','armR'])attr(k,'opacity',flying?0:1);
    mitten('armL',shy?'cheek':yawn?'mouth':pet?'cheek':'low',Math.max(shy,yawn,pet,listen*.5),false,shy*Math.sin(age*12)*1.4);
    mitten('armR',shy||pet?'cheek':wave?'wave':'low',Math.max(shy,pet,wave,yawn*.68),true,shy*Math.sin(age*12+.8)*1.4+wave*2.1*Math.sin(age*14));
  }



    return function draw(action, elapsed, length, weight, hungry) {
      mode=action;age=elapsed;now=elapsed;
      blinkAge=(elapsed+.85)%3.2;
      const t=unit(elapsed/length);
      const girth=petGirth(weight);
      const running=mode==='run'||(mode==='ready'&&t>.26)||(mode==='brake'&&t<.76);
      attr('facing','opacity',running?1:0);attr('portrait','opacity',running?0:1);
      if(!running) {
        paintPortrait(t);
        const bodyScale='translate(46 0) scale('+girth+' 1) translate(-46 0)';
        for(const limb of ['belly','armL','armR']) attr(limb,'transform',bodyScale);
        attr('littleSmile','d',hungry?'M46.2 47.2v1.65 M43.1 50.5q3.1-2.6 6.2 0': 'M46.2 47.1v1.3m-6.4.3c.8 2.2 5 2.15 6.4-.23 1.4 2.08 5.3 2.22 6.5-.08');
        attr('shadow','rx',16.5*girth);attr('shadow','opacity',.20);
        return;
      }
      attr('facing','transform','translate(51 0) scale('+girth+' 1) translate(-51 0)');
      const runProgress=Math.min(strides-.00001,age/period);
      const idx=Math.floor(runProgress);
      const vector=mode==='run'?sequence(idx%2?poses.B:poses.A,runProgress-idx):
        sequence(mode==='ready'?poses.ready:poses.brakeA,t);
    let offset=0;
    function take(n) {
      const a=[];for(let i=0;i<n;i++) a.push([vector[offset++],vector[offset++]]);
      return a;
    }
    drawPath('outline',take(41),true,true);
    drawPath('farFold',take(4));drawPath('topFold',take(3));drawPath('nearFold',take(3));
    const collar=take(4);attr('collar','d','M'+point(collar[0])+'C'+collar.slice(1).map(point).join(' '));
    drawPath('curl',take(4));drawPath('tail',take(6),true);
    const [fx,fy,faceAngle,rise,sx,sy,curl,happy,blush]=vector.slice(offset);
    const rest=mode==='look' || mode==='wave';
    const breath=rest?Math.sin(now*2.6)*.0065:0;
    const height=dragUp+rise;
    const stretchX=(sx-breath*.45).toFixed(4),stretchY=(sy+breath).toFixed(4);
    attr('figure','transform','translate(0 '+num(5-height)+') translate(51 71) scale('+stretchX+' '+stretchY+') translate(-51 -71)');
    attr('face','transform','translate('+num(fx)+' '+num(fy)+') rotate('+num(faceAngle)+')');
    attr('curl','opacity',num(curl));
    const blink=blinkAge<.17?Math.sin(Math.PI*blinkAge/.17):0;
    attr('eyes','transform','scale(1 '+num(Math.max(.08,1-.94*blink))+')');
    attr('eyes','opacity',num(1-happy));attr('happyEyes','opacity',num(happy));attr('blush','opacity',num(blush));
    attr('shadow','rx',num((16.5+(.99-sy)*11)/(1+height*.026)));
    attr('shadow','opacity',num(.215/(1+height*.076)));
    let dustOpacity=0;
    if(mode==='run' || mode==='brake') {
      const frac=mode==='run'?runProgress%1:t;
      const u=unit((frac-.18)/.82);
      const travel=16;
      const at=mode==='run'?57.9+u*travel:62.8+u*6;
      const grow=.52+.52*u;
      dustOpacity=(mode==='run'?.67:.48)*ease(u/.20)*(1-ease((u-.36)/.64));
      attr('dust','transform','translate('+num(at)+' '+num(76.2-u*.65)+') scale('+num(grow)+' '+num(.65+u*.28)+')');
    }
    attr('dust','opacity',num(dustOpacity));
  }
    };
  })();

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
        transform: translateY(-7px) rotate(-5deg);
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

    // Both portraits use the same inactivity clock. Feeding, naming and opening the
    // panel continue to use the original pet state and event handlers.
    const petViews = [
      { host: els.badgeSvg, hit: els.badge, hovered: false },
      { host: els.stageDog, hit: els.stageDog, hovered: false }
    ];
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const quietPeriod = 60000;
    const idleActions = [
      ['shy',2.15], ['look',1.2], ['listen',2.15], ['look',1.2],
      ['yawn',2.6], ['look',1.2], ['wave',1.85], ['look',1.2],
      ['ready',.34], ['run',1.92], ['brake',.51], ['look',1.5]
    ];
    const cycleLength = idleActions.reduce((total, action) => total + action[1], 0);
    let idleAt = performance.now() + quietPeriod;
    let petTimer = 0;

    function touchPet() {
      idleAt = performance.now() + quietPeriod;
      refreshPet();
    }

    function refreshPet() {
      clearTimeout(petTimer);
      if (document.hidden) return;
      const open = root.classList.contains('jm-open');
      const sleeping = isSleeping();
      const hungry = getBodyStatus(state).isHungry;
      const attention = petViews.some((v,i) => (!i || open) && (v.hovered || v.focused));
      const remaining = idleAt - performance.now();
      const free = !attention && !isDragging && !pointerDown && !sleeping && mood === 'idle' && !reduceMotion.matches;
      const playing = free && remaining <= 0;
      let action = 'quiet', elapsed = 0, duration = 1;
      if (playing) {
        elapsed = (-remaining / 1000) % cycleLength;
        for (const [name, seconds] of idleActions) {
          if (elapsed < seconds) { action = name; duration = seconds; break; }
          elapsed -= seconds;
        }
      }
      petViews.forEach((view,i) => {
        if (i && !open) return;
        const held = !i && isDragging;
        const heart = !held && (view.hovered || view.focused || (!i && pointerDown));
        if (heart || held || sleeping || mood !== 'idle') {
          const key = [held,heart,sleeping,mood,hungry,state.weight].join('/');
          if (view.key !== key) {
            view.host.innerHTML = buildXiaoJiMaoSVG(state,mood,held,heart);
            view.key = key;
            view.draw = null;
          }
          return;
        }
        const key = [action,state.weight,hungry].join('/');
        if (!view.draw) view.draw = createPetPainter(view.host);
        if (playing || key !== view.key) view.draw(action,elapsed,duration,state.weight,hungry);
        view.key = key;
      });
      if (free) petTimer = setTimeout(refreshPet, playing ? 40 : Math.max(1,Math.ceil(remaining)));
    }

    for (const view of petViews) {
      for (const eventName of ['pointerenter','pointerleave']) {
        view.hit.addEventListener(eventName, e => {
          if (e.pointerType === 'touch') return;
          view.hovered = eventName === 'pointerenter';
          touchPet();
        });
      }
    }
    els.badge.addEventListener('focus', () => {
      petViews[0].focused = els.badge.matches(':focus-visible');
      touchPet();
    });
    els.badge.addEventListener('blur', () => { petViews[0].focused = false; touchPet(); });
    root.addEventListener('pointerdown', touchPet, true);
    root.addEventListener('click', touchPet, true);
    document.addEventListener('visibilitychange', refreshPet);
    reduceMotion.addEventListener?.('change', refreshPet);

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
      refreshPet();
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


      els.name.textContent = state.name;
      els.badge.setAttribute('aria-label', `与${state.name}互动`);
      els.statusTag.textContent = status.label;
      els.statusTag.style.background = status.color;

      els.stage.classList.toggle('jm-night', sleeping);
      els.badge.classList.toggle('jm-sleeping', sleeping && !isDragging);

      refreshPet();

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

    let grabTimer;
    function liftBadge() {
      if (!pointerDown || hasMoved) return;
      hasMoved = true;
      isDragging = true;
      root.classList.add('jm-dragging');
      setPanelOpen(false);
      root.style.left = startLeft + 'px';
      root.style.top = startTop + 'px';
      root.style.right = 'auto';
      root.style.bottom = 'auto';
      render();
    }

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
      touchPet();
      hasMoved = false;
      startX = pt.x;
      startY = pt.y;
      startLeft = rect.left;
      startTop = rect.top;
      clearTimeout(grabTimer);
      grabTimer = setTimeout(liftBadge, 290);
    }

    function onDragMove(e) {
      if (!pointerDown) return;
      const pt = getClientXY(e);
      const dx = pt.x - startX;
      const dy = pt.y - startY;

      if (!hasMoved && Math.hypot(dx, dy) > 5) liftBadge();

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
      clearTimeout(grabTimer);
      pointerDown = false;
      touchPet();
      if (isDragging) {
        isDragging = false;
        root.classList.remove('jm-dragging');
        updatePanelDirection();
        render('落地啦！换个新角落继续陪你们~');
        // 防止刚松手立即触发 click
        setTimeout(() => { hasMoved = false; }, 60);
      }
    }

    window.addEventListener('blur', onDragEnd);
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
