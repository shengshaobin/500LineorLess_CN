const film = document.getElementById("film");
const soundHint = document.getElementById("soundHint");
const endVeil = document.getElementById("endVeil");
const replay = document.getElementById("replay");

async function playWithSound() {
  film.muted = false;
  await film.play();
  soundHint.hidden = true;
}

async function start() {
  try {
    await playWithSound();
  } catch (err) {
    film.muted = true;
    try {
      await film.play();
      soundHint.hidden = false;
    } catch (playErr) {
      soundHint.hidden = false;
    }
  }
}

soundHint.addEventListener("click", () => {
  playWithSound().catch(() => {});
});

document.body.addEventListener("click", () => {
  if (!soundHint.hidden || film.muted) {
    playWithSound().catch(() => {});
  }
});

film.addEventListener("ended", () => {
  endVeil.hidden = false;
});

replay.addEventListener("click", (event) => {
  event.stopPropagation();
  endVeil.hidden = true;
  film.currentTime = 0;
  playWithSound().catch(() => film.play());
});

start();
