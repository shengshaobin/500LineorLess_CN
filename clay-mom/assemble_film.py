#!/usr/bin/env python3
"""Assemble the clay-mom short film into an MP4."""
import subprocess
from pathlib import Path

ROOT = Path(__file__).parent
ASSETS = ROOT / "assets"
WORK = ROOT / ".film-build"
OUT = ROOT / "film.mp4"
FONT = "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf"
FPS = 24
FADE = 0.9

SHOTS = [
    ("film-original.jpg", 6.2, "in", None),
    ("film-original.jpg", 7.0, "out", "儿子用一块蓝粘土，捏出了妈妈。"),
    ("film-born.jpg", 7.0, "in", "她有点歪，站得很认真。"),
    ("film-close.jpg", 7.0, "out", "眼睛、鼻子，还有这张笑。"),
    ("film-morning.jpg", 7.2, "in", "早上的光，轻轻落在她身上。"),
    ("film-wave.jpg", 6.8, "out", "看见你了。"),
    ("film-dance.jpg", 6.8, "in", "儿子说，妈妈会跳舞。"),
    ("film-bounce.jpg", 6.2, "out", "也会蹦蹦跳跳。"),
    ("film-hug.jpg", 7.8, "in", "最会的，是抱抱。"),
    ("film-kiss.jpg", 7.2, "out", "还有一个吻，留给你。"),
    ("film-night.jpg", 8.2, "in", "夜深了，她还站在那儿。"),
    ("film-night.jpg", 7.2, "out", None),
]


def run(cmd):
    subprocess.run(cmd, check=True)


def make_clip(index, src, duration, ken):
    frames = int(round(duration * FPS))
    zoom = "min(1+0.00055*on,1.10)" if ken == "in" else "min(1.12-0.00055*on,1.12)"
    vf = (
        f"scale=1920:1080,"
        f"zoompan=z='{zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s=1280x720:fps={FPS},"
        f"fade=t=in:st=0:d={FADE},fade=t=out:st={max(duration - FADE - 0.05, 0.2)}:d={FADE},setsar=1"
    )
    if index == 0:
        vf += (
            f",drawtext=fontfile={FONT}:text='一部粘土短片':fontsize=22:fontcolor=0xC9B79A:"
            f"x=(w-text_w)/2:y=(h-text_h)/2-92:shadowcolor=black@0.45:shadowx=2:shadowy=2"
            f",drawtext=fontfile={FONT}:text='妈妈':fontsize=86:fontcolor=white:"
            f"x=(w-text_w)/2:y=(h-text_h)/2-18:shadowcolor=black@0.45:shadowx=3:shadowy=3"
            f",drawtext=fontfile={FONT}:text='儿子捏的':fontsize=24:fontcolor=0xC9B79A:"
            f"x=(w-text_w)/2:y=(h-text_h)/2+78:shadowcolor=black@0.45:shadowx=2:shadowy=2"
        )
    if index == len(SHOTS) - 1:
        vf += (
            f",drawtext=fontfile={FONT}:text='终':fontsize=20:fontcolor=0xC9B79A:"
            f"x=(w-text_w)/2:y=(h-text_h)/2-88:shadowcolor=black@0.45:shadowx=2:shadowy=2"
            f",drawtext=fontfile={FONT}:text='妈妈':fontsize=78:fontcolor=white:"
            f"x=(w-text_w)/2:y=(h-text_h)/2-12:shadowcolor=black@0.45:shadowx=3:shadowy=3"
            f",drawtext=fontfile={FONT}:text='给儿子，也给妈妈':fontsize=24:fontcolor=0xC9B79A:"
            f"x=(w-text_w)/2:y=(h-text_h)/2+78:shadowcolor=black@0.45:shadowx=2:shadowy=2"
        )
    out = WORK / f"shot{index:02d}.mp4"
    run([
        "ffmpeg", "-y", "-loop", "1", "-i", str(ASSETS / src),
        "-t", str(duration), "-vf", vf,
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "22",
        str(out),
    ])
    return out


def write_srt():
    def stamp(ms):
        h = int(ms // 3600000)
        m = int(ms % 3600000 // 60000)
        s = int(ms % 60000 // 1000)
        milli = int(ms % 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{milli:03d}"

    t = 0.0
    lines = []
    n = 1
    for _src, duration, _ken, sub in SHOTS:
        start = t + 1.1
        end = t + duration - 1.0
        t += duration
        if not sub:
            continue
        lines.append(str(n))
        lines.append(f"{stamp(start * 1000)} --> {stamp(end * 1000)}")
        lines.append(sub)
        lines.append("")
        n += 1
    path = WORK / "film.srt"
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def main():
    WORK.mkdir(exist_ok=True)
    wav = ASSETS / "lullaby.wav"
    if not wav.exists():
        run(["python3", str(ROOT / "make_lullaby.py")])
    clips = [make_clip(i, src, duration, ken) for i, (src, duration, ken, _sub) in enumerate(SHOTS)]
    listing = WORK / "concat.txt"
    listing.write_text("".join(f"file '{clip}'\n" for clip in clips), encoding="utf-8")
    silent = WORK / "silent.mp4"
    run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listing),
        "-c", "copy", str(silent),
    ])
    srt = write_srt()
    subtitled = WORK / "subtitled.mp4"
    run([
        "ffmpeg", "-y", "-i", str(silent),
        "-vf", f"subtitles='{srt}':force_style='FontName=Droid Sans Fallback,FontSize=22,PrimaryColour=&H00EAF4F6,OutlineColour=&H80000000,BorderStyle=1,Outline=1,Shadow=0,Alignment=2,MarginV=42'",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "22",
        str(subtitled),
    ])
    run([
        "ffmpeg", "-y",
        "-i", str(subtitled),
        "-stream_loop", "-1", "-i", str(ASSETS / "lullaby.wav"),
        "-shortest",
        "-af", "afade=t=in:st=0:d=1.5,afade=t=out:st=80:d=4",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
        str(OUT),
    ])
    print("wrote", OUT)


if __name__ == "__main__":
    main()
