/** Procedural ambience and the creator's quiet, spatial Wanderer recordings. */
export function createAudio({wandererClips = {}, randomSource = Math.random} = {}) {
  let context = null;
  let master = null;
  let wind = null;
  let drone = null;
  let noiseBuffer = null;
  let muted = false;
  let paused = false;
  let nextStep = 0;
  let nextBird = 0;
  let nextFire = 0;
  let state = { phase: 'day', inside: false, fire: 0 };
  const loops = [];
  const cooldowns = new Map();
  const decoded = new Map();
  const failed = new Set();
  let loadGeneration = 0;
  let wandererMode = 'inactive';
  let wandererSource = null;
  let wandererPanner = null;
  let wandererLevel = null;
  let wandererDistance = null;
  let currentClip = null;
  let voiceStarted = false;
  let voiceIndex = 0;
  let nextVoice = 0;
  let lastPatrolIndex = -1;
  const mouth = {x:0,y:1.8,z:0};
  const listenerPosition = {x:0,y:1.7,z:0};
  const listenerForward = {x:0,y:0,z:-1};
  const hearingDistance = 16;

  const random = (min, max) => min + randomSource() * (max - min);
  const ready = () => context && context.state === 'running' && master && !paused;

  function setPoint(node, prefix, point) {
    if (node[`${prefix}X`]) {
      for (const axis of ['X','Y','Z']) node[`${prefix}${axis}`].value = point[axis.toLowerCase()];
    } else if (prefix === 'position') node.setPosition?.(point.x,point.y,point.z);
  }

  function updateListener(position, forward) {
    if (position) Object.assign(listenerPosition,{x:position.x,y:position.y,z:position.z});
    if (forward) Object.assign(listenerForward,{x:forward.x,y:forward.y,z:forward.z});
    if (!context?.listener) return;
    const listener = context.listener;
    setPoint(listener,'position',listenerPosition);
    if (listener.forwardX) {
      setPoint(listener,'forward',listenerForward);
      setPoint(listener,'up',{x:0,y:1,z:0});
    } else listener.setOrientation?.(listenerForward.x,listenerForward.y,listenerForward.z,0,1,0);
    updateWandererPosition();
  }

  function updateWandererPosition() {
    if (!wandererPanner) return;
    setPoint(wandererPanner,'position',mouth);
    // Panner maxDistance alone does not mute distant inverse-distance sources.
    // Fade the last four metres, then enforce a real quiet-voice hearing radius.
    const distance = Math.hypot(mouth.x-listenerPosition.x,mouth.y-listenerPosition.y,mouth.z-listenerPosition.z);
    const attenuation = Math.max(0,Math.min(1,(hearingDistance-distance)/4));
    wandererDistance.gain.setTargetAtTime(attenuation,context.currentTime,.035);
  }

  function clearWandererVoice() {
    const source = wandererSource;
    wandererSource = null;
    if (source) {
      source.onended = null;
      try { source.stop(); } catch { /* Already ended. */ }
      source.disconnect();
    }
    wandererLevel?.disconnect();
    wandererPanner?.disconnect();
    wandererDistance?.disconnect();
    wandererLevel = wandererPanner = wandererDistance = currentClip = null;
  }

  function tickWanderer() {
    if (!ready() || wandererMode === 'inactive' || wandererSource) return;
    const clips = wandererClips[wandererMode] ?? [];
    if (!clips.length || (wandererMode !== 'patrol' && voiceStarted)) return;
    if (wandererMode === 'patrol') {
      if (context.currentTime < nextVoice) return;
      if (Math.hypot(mouth.x-listenerPosition.x,mouth.z-listenerPosition.z) > hearingDistance) return;
      if (!voiceStarted) {
        voiceIndex = Math.floor(randomSource()*clips.length) % clips.length;
        if (clips.length>1 && voiceIndex === lastPatrolIndex) voiceIndex=(voiceIndex+1)%clips.length;
      }
    }
    const clip = clips[voiceIndex % clips.length];
    const buffer = decoded.get(clip.url);
    if (!buffer) {
      // Failed optional sound hardware or a corrupt clip must not block play.
      if (failed.has(clip.url)) {voiceStarted=wandererMode!=='patrol';nextVoice=context.currentTime+6;}
      return;
    }
    const source = context.createBufferSource();
    const panner = context.createPanner();
    const level = context.createGain();
    const distanceLevel = context.createGain();
    source.buffer = buffer;
    source.loop = wandererMode === 'chase';
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 2.5;
    panner.maxDistance = hearingDistance;
    panner.rolloffFactor = 1.25;
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 360;
    level.gain.value = wandererMode === 'chase' ? .62 : .52;
    distanceLevel.gain.value = 0;
    source.connect(level);
    level.connect(panner);
    panner.connect(distanceLevel);
    distanceLevel.connect(master);
    wandererSource=source;wandererPanner=panner;wandererLevel=level;wandererDistance=distanceLevel;
    currentClip=clip;
    voiceStarted=true;
    if(wandererMode==='patrol')lastPatrolIndex=voiceIndex;
    updateWandererPosition();
    source.onended=()=>{
      if(wandererSource!==source)return;
      clearWandererVoice();
      if(wandererMode==='patrol') {voiceStarted=false;nextVoice=context.currentTime+random(5,11);}
    };
    source.start();
  }

  function setWandererState(mode, position, {clipIndex} = {}) {
    if(position) Object.assign(mouth,{x:position.x,y:(position.y??0)+1.8,z:position.z});
    if(!['patrol','alert','chase','exhausted','capture','inactive'].includes(mode))mode='inactive';
    if(mode!==wandererMode) {
      clearWandererVoice();
      wandererMode=mode;
      voiceStarted=false;
      const count=wandererClips[mode]?.length??1;
      voiceIndex=Number.isInteger(clipIndex)?Math.abs(clipIndex)%count:Math.floor(randomSource()*count)%count;
      nextVoice=(context?.currentTime??0)+(mode==='patrol'?1.3:0);
    }
    updateWandererPosition();
    tickWanderer();
  }

  async function loadWandererClips(audioContext, generation) {
    const clips=Object.values(wandererClips).flat();
    await Promise.all(clips.map(async clip=>{
      if(decoded.has(clip.url)||failed.has(clip.url))return;
      try {
        const response=await fetch(clip.url);
        if(!response.ok)throw new Error('Audio unavailable');
        const buffer=await audioContext.decodeAudioData(await response.arrayBuffer());
        if(context===audioContext && generation===loadGeneration)decoded.set(clip.url,buffer);
      } catch {
        if(context===audioContext && generation===loadGeneration)failed.add(clip.url);
      }
    }));
    if(context===audioContext && generation===loadGeneration)tickWanderer();
  }

  function envelope(gain, at, volume, duration, attack = 0.012) {
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  }

  function route(gain, position) {
    // A subtle spatial hint, without making quiet cues inaudible in one ear.
    if (position && context.createStereoPanner) {
      const pan = context.createStereoPanner();
      pan.pan.value = Math.max(-0.45, Math.min(0.45, Number(position.x || 0) / 60));
      gain.connect(pan);
      pan.connect(master);
      return pan;
    }
    gain.connect(master);
    return null;
  }

  function tone(frequency, endFrequency, duration, volume, type = 'sine', delay = 0, position) {
    if (!ready()) return;
    const at = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(10, frequency), at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(10, endFrequency), at + duration);
    envelope(gain, at, volume, duration, Math.min(0.035, duration / 4));
    oscillator.connect(gain);
    const pan = route(gain, position);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.03);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      pan?.disconnect();
    };
  }

  function noise(duration, volume, frequency = 600, filterType = 'lowpass', delay = 0, position, attack = 0.012) {
    if (!ready()) return;
    const at = context.currentTime + delay;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = noiseBuffer;
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = filterType === 'bandpass' ? 1.2 : 0.7;
    envelope(gain, at, volume, duration, Math.min(attack, duration / 3));
    source.connect(filter);
    filter.connect(gain);
    const pan = route(gain, position);
    source.start(at, random(0, Math.max(0.1, noiseBuffer.duration - duration)));
    source.stop(at + duration + 0.025);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      pan?.disconnect();
    };
  }

  async function start() {
    try {
      if (context) {
        if (context.state === 'suspended' && !paused) await context.resume();
        return;
      }
      const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContext) return;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.42;
      // A compressor catches overlapping cues, keeping the mix comfortable.
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 22;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.01;
      compressor.release.value = 0.3;
      master.connect(compressor);
      compressor.connect(context.destination);

      noiseBuffer = context.createBuffer(1, context.sampleRate * 6, context.sampleRate);
      const samples = noiseBuffer.getChannelData(0);
      let previous = 0;
      for (let i = 0; i < samples.length; i++) {
        previous = (previous + (Math.random() * 2 - 1) * 0.2) / 1.15;
        samples[i] = previous * 2.5;
      }
      const windSource = context.createBufferSource();
      windSource.buffer = noiseBuffer;
      windSource.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 520;
      wind = context.createGain();
      wind.gain.value = 0.035;
      windSource.connect(filter);
      filter.connect(wind);
      wind.connect(master);
      windSource.start();
      loops.push(windSource);

      drone = context.createGain();
      drone.gain.value = 0.002;
      drone.connect(master);
      for (const frequency of [43.65, 65.7, 87.9]) {
        const oscillator = context.createOscillator();
        const level = context.createGain();
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        level.gain.value = frequency < 50 ? 1 : 0.3;
        oscillator.connect(level);
        level.connect(drone);
        oscillator.start();
        loops.push(oscillator);
      }
      nextStep = context.currentTime + 0.3;
      nextBird = context.currentTime + 3;
      nextFire = context.currentTime;
      updateListener();
      if (context.state === 'suspended' && !paused) await context.resume();
      await loadWandererClips(context,++loadGeneration);
    } catch {
      // Sound is atmospheric; unsupported hardware must never block the game.
    }
  }

  function update(nextState = {}) {
    state = { ...state, ...nextState };
    if (!ready()) return;
    tickWanderer();
    const now = context.currentTime;
    const night = state.phase === 'night';
    const breeze = 0.035 + Math.sin(now * 0.31) * 0.008;
    wind.gain.setTargetAtTime(breeze * (state.inside ? 0.33 : 1), now, 0.6);
    drone.gain.setTargetAtTime(night ? 0.055 : 0.003, now, 1.2);

    if (state.moving && now >= nextStep) {
      noise(state.inside ? 0.13 : 0.23, state.sprinting ? 0.16 : 0.10,
        state.inside ? 280 : 950, 'lowpass');
      if (state.inside) tone(random(80, 110), 45, 0.12, 0.035);
      nextStep = now + (state.sprinting ? 0.32 : 0.56);
    } else if (!state.moving) {
      nextStep = Math.max(nextStep, now);
    }

    if (!night && !state.inside && now >= nextBird) {
      const pitch = random(1800, 2700);
      tone(pitch, pitch * 1.2, 0.13, 0.035);
      tone(pitch * 0.92, pitch * 1.06, 0.18, 0.025, 'sine', 0.18);
      nextBird = now + random(7, 15);
    }
    if (state.inside && state.fire > 0 && now >= nextFire) {
      noise(random(0.08, 0.22), random(0.035, 0.08), random(1000, 2500), 'highpass');
      nextFire = now + random(0.15, 0.5);
    }
  }

  function play(name, position) {
    if (!ready()) return;
    name = { reveal: 'impostor', warning: 'danger' }[name] || name;
    const now = context.currentTime;
    const cooldown = { breath: 2.6, rustle: 0.8, 'wood-creak': 1.1, laugh: 4, knock: 0.7, danger: 2, impostor: 2, help: 5 }[name] || 0.08;
    if ((cooldowns.get(name) ?? -Infinity) + cooldown > now) return;
    cooldowns.set(name, now);
    switch (name) {
      case 'breath':
        noise(1.3, 0.15, 700, 'bandpass', 0, position, 0.35);
        noise(0.95, 0.12, 420, 'bandpass', 1.35, position, 0.2);
        tone(69, 53, 0.9, 0.035, 'triangle', 0.25, position);
        break;
      case 'rustle':
        noise(0.7, 0.13, 1800, 'highpass', 0, position, 0.12);
        noise(0.35, 0.08, 900, 'bandpass', 0.32, position);
        break;
      case 'wood-creak':
        // A trunk straining under its own weight, followed by a small dry
        // landing. Soft attacks keep the cue distinct without a loud crack.
        tone(192, 126, 0.43, 0.055, 'triangle', 0, position);
        tone(365, 258, 0.37, 0.021, 'triangle', 0.07, position);
        noise(0.46, 0.045, 860, 'bandpass', 0, position, 0.12);
        noise(0.13, 0.065, 950, 'lowpass', 0.51, position, 0.018);
        tone(117, 49, 0.14, 0.038, 'triangle', 0.51, position);
        break;
      case 'laugh':
        for (let i = 0; i < 6; i++) {
          tone(240 - i * 12, 155 - i * 7, 0.16, 0.07, 'triangle', i * 0.24, position);
          noise(0.15, 0.06, 1100, 'bandpass', i * 0.24, position);
        }
        break;
      case 'knock':
        tone(110, 38, 0.23, 0.20, 'triangle', 0, position);
        noise(0.13, 0.17, 700, 'lowpass', 0, position);
        tone(90, 40, 0.17, 0.12, 'triangle', 0.24, position);
        break;
      case 'hit':
        noise(0.23, 0.20, 800, 'lowpass', 0, position);
        tone(95, 32, 0.2, 0.13, 'triangle');
        break;
      case 'neck-snap':
        // A brief dry impact under cloth, kept below the voice in the mix.
        noise(.085,.085,720,'lowpass');
        noise(.13,.035,1450,'bandpass',.035);
        tone(87,39,.12,.045,'triangle');
        break;
      case 'collect':
        noise(0.12, 0.055, 1000, 'lowpass');
        tone(650, 820, 0.16, 0.04);
        break;
      case 'craft':
        [0, 0.16, 0.34].forEach(delay => {
          noise(0.12, 0.13, 1250, 'lowpass', delay);
          tone(150, 70, 0.1, 0.05, 'triangle', delay);
        });
        break;
      case 'eat':
        noise(0.18, 0.06, 1800, 'lowpass');
        noise(0.14, 0.04, 1000, 'lowpass', 0.22);
        break;
      case 'fire':
        noise(0.7, 0.12, 1600, 'highpass', 0, position, 0.05);
        break;
      case 'danger':
        tone(48, 71, 1.5, 0.12);
        tone(73, 77, 1.4, 0.045, 'triangle');
        break;
      case 'dawn':
        [261.63, 329.63, 392].forEach((frequency, i) => {
          tone(frequency, frequency, 2.3, 0.045, 'sine', i * 0.28);
        });
        break;
      case 'night':
        tone(110, 41, 3.2, 0.11);
        noise(2.3, 0.07, 400, 'lowpass', 0, undefined, 0.6);
        break;
      case 'impostor':
        tone(135, 45, 1.2, 0.12, 'triangle', 0, position);
        tone(142, 53, 1.1, 0.07, 'sawtooth', 0, position);
        noise(0.7, 0.13, 1700, 'bandpass', 0, position);
        break;
      case 'help':
        // Two wavering, breathy cries: a human lure with an uneasy overtone.
        tone(235, 175, 0.55, 0.06, 'triangle', 0, position);
        tone(470, 350, 0.5, 0.018, 'sine', 0.03, position);
        noise(0.5, 0.055, 950, 'bandpass', 0, position, 0.1);
        tone(265, 155, 0.8, 0.055, 'triangle', 0.75, position);
        noise(0.75, 0.045, 750, 'bandpass', 0.75, position, 0.13);
        break;
      case 'spear':
        noise(0.22, 0.14, 1700, 'bandpass', 0, position, 0.035);
        tone(130, 55, 0.1, 0.05, 'triangle', 0.14, position);
        break;
      case 'break':
        noise(0.45, 0.21, 1600, 'highpass', 0, position);
        noise(0.15, 0.13, 600, 'lowpass', 0.12, position);
        break;
      default:
        break;
    }
  }

  function setMuted(value) {
    muted = Boolean(value);
    if (context && master) master.gain.setTargetAtTime(muted ? 0 : 0.42, context.currentTime, 0.06);
  }

  function setPaused(value) {
    paused=Boolean(value);
    if(!context)return;
    try {
      const operation=paused?context.suspend():context.resume();
      operation?.then(()=>{if(!paused)tickWanderer();}).catch(()=>{});
    } catch { /* Audio support never blocks a pause or resume. */ }
  }

  function stop() {
    ++loadGeneration;
    clearWandererVoice();
    wandererMode='inactive';
    voiceStarted=false;
    decoded.clear();
    failed.clear();
    for (const source of loops.splice(0)) {
      try { source.stop(); } catch { /* Already stopped. */ }
      source.disconnect();
    }
    if (context) context.close().catch(() => {});
    context = null;
    master = null;
    wind = null;
    drone = null;
    noiseBuffer = null;
    cooldowns.clear();
  }

  return { start, update, play, setMuted, setPaused, stop, setWandererState, updateListener,
    get debug() {
      return {contextState:context?.state??'uninitialized',paused,muted,currentMode:wandererMode,
        currentClip:currentClip?.name??null,playing:Boolean(wandererSource),looping:Boolean(wandererSource?.loop),
        decodedClips:decoded.size,failedClips:failed.size,totalClips:Object.values(wandererClips).flat().length,
        sourcePosition:{...mouth},listenerPosition:{...listenerPosition},listenerForward:{...listenerForward},
        hearingDistance};
    }
  };
}
