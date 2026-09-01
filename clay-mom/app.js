const FRAMES = {
  idle: "assets/mom-idle.jpg",
  wave: "assets/mom-wave.jpg",
  wave2: "assets/mom-wave2.jpg",
  hug: "assets/mom-hug.jpg",
  dance: "assets/mom-dance.jpg",
  dance2: "assets/mom-dance2.jpg",
  jump: "assets/mom-jump.jpg",
  kiss: "assets/mom-kiss.jpg",
  spin: "assets/mom-spin.jpg",
  squash: "assets/mom-squash.jpg",
};

const ACTS = {
  idle: {
    frames: ["idle", "squash", "idle", "jump"],
    hold: 700,
    loop: true,
    line: "",
  },
  wave: {
    frames: ["idle", "wave", "wave2", "wave", "wave2", "wave", "idle"],
    hold: 220,
    line: "你好呀～",
  },
  hug: {
    frames: ["idle", "hug", "hug", "hug", "hug", "idle"],
    hold: 260,
    line: "抱抱！",
    fx: "hearts",
    hug: true,
  },
  dance: {
    frames: ["idle", "dance", "dance2", "jump", "spin", "dance", "dance2", "idle"],
    hold: 180,
    line: "一起跳舞！",
    fx: "sparks",
  },
  kiss: {
    frames: ["idle", "kiss", "kiss", "kiss", "idle"],
    hold: 260,
    line: "爱你！",
    fx: "hearts",
  },
  bounce: {
    frames: ["idle", "squash", "jump", "squash", "jump", "idle"],
    hold: 170,
    line: "嘿嘿！",
  },
};

const SHOW = ["wave", "hug", "dance", "kiss", "bounce"];

const mom = document.getElementById("mom");
const shadow = document.getElementById("shadow");
const speech = document.getElementById("speech");
const fx = document.getElementById("fx");
const curtain = document.getElementById("curtain");
const crumbs = document.querySelector(".crumbs");

let timer = 0;
let idleTimer = 0;
let busy = false;
let frameIndex = 0;
let current = ACTS.idle;

function preload() {
  Object.values(FRAMES).forEach((src) => {
    const img = new Image();
    img.src = src;
  });
}

function say(text) {
  speech.hidden = !text;
  speech.textContent = text || "";
}

function setPose(name) {
  mom.src = FRAMES[name] || FRAMES.idle;
  const airborne = name === "jump" || name === "spin";
  shadow.classList.toggle("up", airborne);
  mom.classList.toggle("jumping", name === "jump");
  mom.classList.toggle("hugging", name === "hug");
}

function burst(kind) {
  const glyphs = kind === "hearts" ? ["❤", "💗", "💕"] : ["✦", "✧", "★"];
  for (let i = 0; i < 12; i += 1) {
    const node = document.createElement("span");
    node.className = kind === "hearts" ? "heart" : "spark";
    node.textContent = glyphs[i % glyphs.length];
    node.style.setProperty("--dx", `${(Math.random() - 0.5) * 220}px`);
    node.style.left = `${28 + Math.random() * 44}%`;
    node.style.top = `${28 + Math.random() * 24}%`;
    node.style.animationDelay = `${i * 0.06}s`;
    fx.appendChild(node);
    window.setTimeout(() => node.remove(), 2000);
  }
}

function playAct(name, { thenIdle = true } = {}) {
  const act = ACTS[name];
  if (!act) return Promise.resolve();

  busy = name !== "idle";
  current = act;
  frameIndex = 0;
  window.clearInterval(timer);
  window.clearTimeout(idleTimer);
  say(act.line);
  if (act.fx) burst(act.fx);

  return new Promise((resolve) => {
    const tick = () => {
      const pose = act.frames[frameIndex];
      setPose(pose);
      if (act.fx && (pose === "hug" || pose === "kiss" || pose === "dance")) {
        if (frameIndex === 1) burst(act.fx);
      }
      frameIndex += 1;
      if (frameIndex >= act.frames.length) {
        window.clearInterval(timer);
        if (act.loop) {
          frameIndex = 0;
          timer = window.setInterval(tick, act.hold);
          resolve();
          return;
        }
        if (thenIdle) startIdle();
        resolve();
      }
    };
    tick();
    timer = window.setInterval(tick, act.hold);
  });
}

function startIdle() {
  busy = false;
  say("");
  playAct("idle");
}

async function playShow() {
  if (busy) return;
  busy = true;
  say("开演啦！");
  for (const name of SHOW) {
    await playAct(name, { thenIdle: false });
    await wait(280);
  }
  startIdle();
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function randomAct() {
  const names = ["wave", "hug", "dance", "kiss", "bounce"];
  return names[Math.floor(Math.random() * names.length)];
}

function scatterCrumbs() {
  for (let i = 0; i < 14; i += 1) {
    const crumb = document.createElement("span");
    crumb.style.left = `${Math.random() * 100}%`;
    crumb.style.top = `${10 + Math.random() * 80}%`;
    crumb.style.animationDelay = `${Math.random() * 4}s`;
    crumb.style.transform = `scale(${0.5 + Math.random()})`;
    crumbs.appendChild(crumb);
  }
}

document.querySelectorAll("[data-act], #momHit").forEach((el) => {
  el.disabled = true;
});

document.querySelectorAll("[data-act]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const act = btn.dataset.act;
    if (act === "show") playShow();
    else if (!busy) playAct(act);
  });
});

document.getElementById("momHit").addEventListener("click", () => {
  if (!busy) playAct(randomAct());
});

document.getElementById("openShow").addEventListener("click", async () => {
  curtain.classList.remove("closed");
  document.querySelectorAll("[data-act], #momHit").forEach((el) => {
    el.disabled = false;
  });
  await wait(400);
  playAct("wave");
});

function plop() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(420 + Math.random() * 180, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch (err) {
    // Audio is optional decoration.
  }
}

document.querySelectorAll("[data-act], #momHit, #openShow").forEach((el) => {
  el.addEventListener("click", plop);
});

preload();
scatterCrumbs();
curtain.classList.add("closed");
