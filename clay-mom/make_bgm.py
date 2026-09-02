#!/usr/bin/env python3
"""A cute music-box BGM for the clay-mom short."""
import math
import struct
import wave
from pathlib import Path

RATE = 44100
OUT = Path(__file__).parent / "assets" / "bgm.wav"
BPM = 118
BEAT = 60.0 / BPM

# Bright, bouncy C-major motif — like a little music box.
MELODY = [
    (72, 0.5), (76, 0.5), (79, 0.5), (76, 0.5),
    (81, 0.75), (79, 0.25), (76, 0.5), (72, 0.5),
    (74, 0.5), (76, 0.5), (79, 0.5), (81, 0.5),
    (79, 1.0), (76, 1.0),
    (76, 0.5), (79, 0.5), (84, 1.0),
    (83, 0.5), (81, 0.5), (79, 0.5), (76, 0.5),
    (72, 0.5), (76, 0.5), (79, 0.5), (81, 0.5),
    (79, 0.5), (76, 0.5), (72, 1.0),
    (74, 0.5), (76, 0.5), (79, 0.75), (81, 0.25),
    (84, 0.5), (81, 0.5), (79, 0.5), (76, 0.5),
    (72, 0.5), (74, 0.5), (76, 1.0),
    (72, 2.0),
]

# Quiet oom-pah under the tune.
BASS = [
    (48, 1.0), (55, 1.0), (48, 1.0), (55, 1.0),
    (53, 1.0), (55, 1.0), (48, 1.0), (52, 1.0),
    (48, 1.0), (55, 1.0), (53, 1.0), (55, 1.0),
    (48, 1.0), (47, 1.0), (48, 2.0),
]


def midi_hz(n):
    return 440.0 * (2 ** ((n - 69) / 12))


def add_bell(buf, start, midi, beats, amp):
    length = int(RATE * beats * BEAT)
    freq = midi_hz(midi)
    for i in range(length):
        t = i / RATE
        # Music-box pluck: fast attack, ringing decay.
        env = math.exp(-t * (3.4 if beats < 1.2 else 2.2))
        if i < RATE * 0.008:
            env *= i / (RATE * 0.008)
        tone = math.sin(2 * math.pi * freq * t)
        tone += 0.28 * math.sin(2 * math.pi * freq * 2 * t)
        tone += 0.08 * math.sin(2 * math.pi * freq * 3 * t)
        idx = start + i
        if idx >= len(buf):
            buf.extend([0.0] * (idx - len(buf) + 1))
        buf[idx] += tone * env * amp


def add_bass(buf, start, midi, beats, amp):
    length = int(RATE * beats * BEAT)
    freq = midi_hz(midi)
    for i in range(length):
        t = i / RATE
        env = math.exp(-t * 5.5)
        if i < RATE * 0.01:
            env *= i / (RATE * 0.01)
        tone = math.sin(2 * math.pi * freq * t)
        idx = start + i
        if idx >= len(buf):
            buf.extend([0.0] * (idx - len(buf) + 1))
        buf[idx] += tone * env * amp


def place_line(buf, notes, start_beat, add_fn, amp):
    cursor = int(start_beat * BEAT * RATE)
    for midi, beats in notes:
        add_fn(buf, cursor, midi, beats, amp)
        cursor += int(beats * BEAT * RATE)


def main():
    buf = [0.0] * int(RATE * 36)
    # Two times through the tune covers the ~28s film.
    for repeat in range(3):
        start = repeat * 16
        place_line(buf, MELODY, start, add_bell, 0.22)
        place_line(buf, BASS * 2, start, add_bass, 0.09)
        # High sparkle answering the phrase.
        sparkle = [(96, 0.25), (93, 0.25), (91, 0.5)]
        place_line(buf, sparkle, start + 7.5, add_bell, 0.08)
        place_line(buf, sparkle, start + 15.5, add_bell, 0.07)

    peak = max(abs(s) for s in buf) or 1.0
    amp = 0.78 / peak
    # Trim trailing silence a bit, keep a tail.
    end = len(buf)
    while end > RATE and abs(buf[end - 1]) < 1e-4:
        end -= 1
    end = min(len(buf), end + int(RATE * 0.4))

    OUT.parent.mkdir(exist_ok=True)
    with wave.open(str(OUT), "w") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        for s in buf[:end]:
            v = max(-1.0, min(1.0, s * amp))
            wav.writeframes(struct.pack("<h", int(v * 32767)))
    print(OUT, "seconds", round(end / RATE, 1))


if __name__ == "__main__":
    main()
