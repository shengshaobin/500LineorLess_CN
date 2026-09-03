#!/usr/bin/env python3
"""A bouncy, slightly silly dance BGM for the clay-mom short."""
import wave
from pathlib import Path

import numpy as np

RATE = 44100
OUT = Path(__file__).parent / "assets" / "bgm.wav"
BPM = 120
BEAT = 60.0 / BPM
BARS = 8
SECONDS = BARS * 4 * BEAT  # 16s


def midi_hz(n):
    return 440.0 * (2.0 ** ((n - 69) / 12.0))


def place(buf, start, samples):
    end = min(len(buf), start + len(samples))
    if start >= len(buf) or end <= start:
        return
    buf[start:end] += samples[: end - start]


def exp_env(n, decay, attack=0.004):
    t = np.arange(n) / RATE
    env = np.exp(-t * decay)
    att = min(int(RATE * attack), n)
    if att > 1:
        env[:att] *= np.linspace(0.0, 1.0, att)
    return env


def kick(buf, start):
    n = int(RATE * 0.22)
    t = np.arange(n) / RATE
    freq = 78 * np.exp(-t * 16)
    phase = 2 * np.pi * np.cumsum(freq) / RATE
    body = np.sin(phase) * np.exp(-t * 14)
    click = np.sin(2 * np.pi * 1900 * t) * np.exp(-t * 70) * 0.22
    place(buf, start, (body + click) * 0.95)


def clap(buf, start):
    n = int(RATE * 0.16)
    noise = np.random.default_rng(start).uniform(-1, 1, n)
    t = np.arange(n) / RATE
    env = np.exp(-t * 28)
    env[int(0.012 * RATE) : int(0.02 * RATE)] *= 0.35  # double clap
    # Cheap band emphasis around 2kHz.
    tone = np.sin(2 * np.pi * 2100 * t) * np.exp(-t * 40) * 0.25
    place(buf, start, (noise * env * 0.38 + tone) * 0.9)


def hat(buf, start, open_hat=False):
    n = int(RATE * (0.09 if open_hat else 0.035))
    noise = np.random.default_rng(start + 7).uniform(-1, 1, n)
    t = np.arange(n) / RATE
    env = np.exp(-t * (18 if open_hat else 55))
    place(buf, start, noise * env * (0.14 if open_hat else 0.09))


def square(freq, n):
    t = np.arange(n) / RATE
    return np.sign(np.sin(2 * np.pi * freq * t))


def bass_note(buf, start, midi, beats, amp=0.22):
    n = int(RATE * beats * BEAT)
    freq = midi_hz(midi)
    t = np.arange(n) / RATE
    # Slightly rubbery square + sub sine.
    tone = 0.55 * square(freq, n) + 0.7 * np.sin(2 * np.pi * freq * t)
    env = exp_env(n, 4.8 if beats < 1 else 2.6, attack=0.006)
    place(buf, start, tone * env * amp)


def lead_note(buf, start, midi, beats, amp=0.16):
    n = int(RATE * beats * BEAT)
    freq = midi_hz(midi)
    t = np.arange(n) / RATE
    # Chiptune square with a fifth sparkle.
    tone = 0.7 * square(freq, n) + 0.18 * square(freq * 1.5, n)
    tone += 0.12 * np.sin(2 * np.pi * freq * 2 * t)
    env = exp_env(n, 6.5 if beats < 0.6 else 3.4, attack=0.004)
    place(buf, start, tone * env * amp)


def whistle(buf, start, midi, beats, amp=0.09):
    n = int(RATE * beats * BEAT)
    freq = midi_hz(midi)
    t = np.arange(n) / RATE
    vib = freq * (1 + 0.012 * np.sin(2 * np.pi * 6.5 * t))
    phase = 2 * np.pi * np.cumsum(vib) / RATE
    tone = np.sin(phase) + 0.15 * np.sin(2 * phase)
    env = exp_env(n, 3.2, attack=0.02)
    place(buf, start, tone * env * amp)


def slide_whistle(buf, start, midi_from, midi_to, beats, amp=0.11):
    n = int(RATE * beats * BEAT)
    t = np.arange(n) / RATE
    midi = np.linspace(midi_from, midi_to, n)
    freq = 440.0 * (2.0 ** ((midi - 69) / 12.0))
    phase = 2 * np.pi * np.cumsum(freq) / RATE
    env = exp_env(n, 2.4, attack=0.01)
    place(buf, start, np.sin(phase) * env * amp)


def boing(buf, start):
    n = int(RATE * 0.28)
    t = np.arange(n) / RATE
    freq = 520 * np.exp(-t * 7)
    phase = 2 * np.pi * np.cumsum(freq) / RATE
    env = np.exp(-t * 8)
    place(buf, start, np.sin(phase) * env * 0.18)


def cowbell(buf, start):
    n = int(RATE * 0.12)
    t = np.arange(n) / RATE
    tone = np.sin(2 * np.pi * 845 * t) + 0.6 * np.sin(2 * np.pi * 1280 * t)
    env = np.exp(-t * 22)
    place(buf, start, tone * env * 0.08)


def beat_to_sample(beat):
    return int(start_beat(beat) * RATE)


def start_beat(beat):
    return beat * BEAT


def main():
    rng_seed = 42
    np.random.seed(rng_seed)
    n = int(RATE * (SECONDS + 0.4))
    buf = np.zeros(n, dtype=np.float64)

    # 8 bars of 4/4. Bar 0 is a teasing intro, drop on bar 1.
    # Bass riff: C - C - F - G  (child-like I–IV–V)
    bass_loop = [48, 48, 53, 55]
    # Catchy 4-bar hook, then a sillier answering phrase.
    melody_a = [
        (72, 0.5), (76, 0.5), (79, 0.5), (76, 0.5),
        (84, 0.5), (79, 0.5), (76, 0.5), (72, 0.5),
        (74, 0.5), (76, 0.5), (79, 0.5), (81, 0.5),
        (79, 0.75), (76, 0.25), (72, 1.0),
    ]
    melody_b = [
        (84, 0.5), (83, 0.5), (81, 0.5), (79, 0.5),
        (76, 0.5), (79, 0.5), (84, 1.0),
        (86, 0.5), (84, 0.5), (81, 0.5), (79, 0.5),
        (76, 0.5), (72, 0.5), (74, 0.5), (76, 0.5),
    ]

    # Drums every 8 bars.
    for bar in range(BARS):
        bar_beat = bar * 4
        full = bar >= 1
        for beat in range(4):
            abs_beat = bar_beat + beat
            s = beat_to_sample(abs_beat)
            kick(buf, s)
            if full and beat in (1, 3):
                clap(buf, s)
            if beat == 3:
                cowbell(buf, s)
            # 8th hats; open hat on the last offbeat of each bar.
            hat(buf, s, open_hat=False)
            hat(buf, beat_to_sample(abs_beat + 0.5), open_hat=(beat == 3 and full))
        if full:
            bass_note(buf, beat_to_sample(bar_beat), bass_loop[bar % 4], 1.0, 0.24)
            bass_note(buf, beat_to_sample(bar_beat + 1), bass_loop[bar % 4], 1.0, 0.16)
            bass_note(buf, beat_to_sample(bar_beat + 2), bass_loop[(bar + 1) % 4], 1.0, 0.20)
            bass_note(buf, beat_to_sample(bar_beat + 3), bass_loop[(bar + 2) % 4], 1.0, 0.18)

    # Drop sting.
    boing(buf, beat_to_sample(4))
    slide_whistle(buf, beat_to_sample(4), 84, 96, 0.5, 0.10)

    # Melody from the drop, two times through.
    cursor = 4.0
    for midi, beats in melody_a + melody_b:
        lead_note(buf, beat_to_sample(cursor), midi, beats, 0.17)
        cursor += beats

    # Whistle answering the hook — the "funny" earworm.
    whistle_line = [
        (96, 0.5), (98, 0.5), (96, 0.5), (91, 0.5),
        (88, 0.5), (91, 0.5), (88, 1.0),
    ]
    cursor = 12.0
    for midi, beats in whistle_line:
        whistle(buf, beat_to_sample(cursor), midi, beats, 0.11)
        cursor += beats

    # Extra slide at the freeze-friendly last bar.
    slide_whistle(buf, beat_to_sample(28), 96, 72, 1.5, 0.12)
    boing(buf, beat_to_sample(30))

    peak = np.max(np.abs(buf)) or 1.0
    amp = 0.86 / peak
    audio = np.clip(buf * amp, -1.0, 1.0)

    # Trim trailing silence, keep a short tail.
    nz = np.where(np.abs(audio) > 1e-4)[0]
    end = int(nz[-1] + RATE * 0.25) if len(nz) else len(audio)
    end = min(len(audio), end)

    OUT.parent.mkdir(exist_ok=True)
    with wave.open(str(OUT), "w") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        pcm = (audio[:end] * 32767).astype(np.int16)
        wav.writeframes(pcm.tobytes())
    print(OUT, "seconds", round(end / RATE, 1))


if __name__ == "__main__":
    main()
