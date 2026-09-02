const stage = document.querySelector('#stage');
const photoShell = document.querySelector('#photo-shell');
const photo = document.querySelector('#photo');
const queue = [];
let playing = false;
let eventSource;

function connect() {
  eventSource?.close();
  eventSource = new EventSource('/polaroid/events');
  eventSource.addEventListener('polaroid', (event) => {
    try {
      queue.push(JSON.parse(event.data));
      if (!playing) void playNext();
    } catch (error) {
      console.warn('[POLAROID] Ignored invalid server message', error);
    }
  });
}

async function playNext() {
  const item = queue.shift();
  if (!item) {
    playing = false;
    return;
  }
  playing = true;
  const showMs = Math.max(3000, Number(item.showMs) || 11000);
  stage.style.setProperty('--show-ms', `${showMs}ms`);
  photoShell.setAttribute('aria-hidden', 'false');
  try {
    await preload(item.imageUrl);
    photo.src = item.imageUrl;
    photo.alt = `Polaroid taken by ${item.redeemerName}`;
    restartClass('is-flashing');
    playWow(Number(item.soundVolume));
    setTimeout(() => restartClass('is-showing'), 110);
    await wait(showMs + 180);
  } catch (error) {
    console.error('[POLAROID] Could not show image', error);
  }
  stage.classList.remove('is-flashing', 'is-showing');
  photoShell.setAttribute('aria-hidden', 'true');
  await wait(Math.max(0, Number(item.gapMs) || 750));
  void playNext();
}

function restartClass(className) {
  stage.classList.remove(className);
  void stage.offsetWidth;
  stage.classList.add(className);
}

function preload(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = reject;
    image.src = url;
  });
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function playWow(volume = 0.8) {
  const custom = new Audio('/polaroid/assets/audio/wow.mp3');
  custom.volume = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0.8));
  custom.play().catch(() => playSynthWow(custom.volume));
}

function playSynthWow(volume) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const context = new AudioContext();
  const now = context.currentTime;
  const master = context.createGain();
  const filter = context.createBiquadFilter();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(Math.max(0.01, volume * 0.22), now + 0.035);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 1.08);
  filter.type = 'bandpass';
  filter.Q.value = 4.5;
  filter.frequency.setValueAtTime(380, now);
  filter.frequency.exponentialRampToValueAtTime(1050, now + 0.34);
  filter.frequency.exponentialRampToValueAtTime(520, now + 1.02);
  filter.connect(master).connect(context.destination);
  [0, 7].forEach((detune, index) => {
    const oscillator = context.createOscillator();
    oscillator.type = index ? 'triangle' : 'sawtooth';
    oscillator.detune.value = detune;
    oscillator.frequency.setValueAtTime(155, now);
    oscillator.frequency.exponentialRampToValueAtTime(245, now + 0.33);
    oscillator.frequency.exponentialRampToValueAtTime(118, now + 1.02);
    oscillator.connect(filter);
    oscillator.start(now);
    oscillator.stop(now + 1.1);
  });
  setTimeout(() => context.close(), 1400);
}

window.polaroidOverlay = { queue, reconnect: connect };
connect();
