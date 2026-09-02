#!/usr/bin/env python3
"""A short, quiet lullaby for the clay-mom film."""
import math
import struct
import wave
from pathlib import Path

RATE = 44100
OUT = Path(__file__).parent / "assets" / "lullaby.wav"

# Pentatonic, like a hummed bedtime song.
MELODY = [
    (64, 1.2), (67, 1.2), (71, 1.6), (67, 1.0),
    (64, 1.2), (62, 1.2), (60, 2.4),
    (67, 1.2), (71, 1.2), (72, 1.6), (71, 1.0),
    (67, 1.2), (64, 1.2), (62, 2.4),
    (64, 1.2), (67, 1.2), (71, 1.6), (74, 1.0),
    (72, 1.2), (71, 1.2), (67, 2.4),
    (64, 1.2), (67, 1.0), (64, 1.0), (62, 1.2),
    (60, 3.6),
]


def midi_to_hz(n):
    return 440.0 * (2 ** ((n - 69) / 12))


def envelope(i, n, attack=0.08, release=0.28):
    a = int(n * attack)
    r = int(n * release)
    if i < a:
        return i / max(a, 1)
    if i > n - r:
        return max(0.0, (n - i) / max(r, 1))
    return 1.0


def main():
    samples = []
    # Soft low drone
    drone_len = int(RATE * 78)
    for i in range(drone_len):
        t = i / RATE
        fade = 1.0
        if i < RATE * 2:
            fade = i / (RATE * 2)
        if i > drone_len - RATE * 6:
            fade = max(0.0, (drone_len - i) / (RATE * 6))
        drone = 0.045 * math.sin(2 * math.pi * 98 * t)
        drone += 0.02 * math.sin(2 * math.pi * 196 * t)
        samples.append(drone * fade)

    cursor = int(RATE * 1.4)
    for midi, beats in MELODY * 2:
        length = int(RATE * beats * 0.78)
        freq = midi_to_hz(midi)
        for i in range(length):
            if cursor + i >= len(samples):
                samples.extend([0.0] * (cursor + i - len(samples) + 1))
            t = i / RATE
            env = envelope(i, length) * 0.16
            tone = math.sin(2 * math.pi * freq * t)
            tone += 0.35 * math.sin(2 * math.pi * freq * 2 * t)
            samples[cursor + i] += tone * env
        cursor += length

    # Fade tail
    peak = max(abs(s) for s in samples) or 1.0
    amp = 0.72 / peak
    with wave.open(str(OUT), "w") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        for s in samples:
            v = max(-1.0, min(1.0, s * amp))
            wav.writeframes(struct.pack("<h", int(v * 32767)))
    print(OUT, "seconds", round(len(samples) / RATE, 1))


if __name__ == "__main__":
    main()
