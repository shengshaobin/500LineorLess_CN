#!/usr/bin/env python3
"""Assemble a stop-motion 'Mom's day' short film."""
import subprocess
from pathlib import Path

ROOT = Path(__file__).parent
ASSETS = ROOT / "assets"
DAY = ASSETS / "day"
WORK = ROOT / ".film-build"
OUT = ROOT / "film.mp4"
FONT = "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf"
FPS = 24
HOLD = 0.36

# Each scene is a list of stills played as claymation, then a subtitle.
SCENES = [
    {
        "frames": ["wake1", "wake1", "wake1", "wake1", "wake1", "wake2", "wake2", "wake1", "wake2"],
        "loops": 2,
        "sub": "早上，先伸个懒腰。",
        "title": "妈妈的一天",
    },
    {
        "frames": ["sweep1", "sweep2"],
        "loops": 10,
        "sub": "把地扫干净。",
    },
    {
        "frames": ["cook1", "cook2", "cook4", "cook2", "cook3", "cook5", "cook2", "cook4"],
        "loops": 3,
        "sub": "早饭得自己做。",
    },
    {
        "frames": ["work1", "work5", "work2", "work5", "work3", "work5", "work2", "work4"],
        "loops": 3,
        "sub": "坐下来，把工作做完。",
    },
    {
        "frames": ["laundry1", "laundry2"],
        "loops": 8,
        "sub": "衣服也要晾好。",
    },
    {
        "frames": [
            "lawn1", "lawn2", "lawn4", "lawn2",
            "lawn1", "lawn4", "lawn2", "lawn1",
            "lawn4", "lawn2",
            "lawn3", "lawn7", "lawn3", "lawn7",
            "lawn5", "lawn6", "lawn7", "lawn3",
            "lawn5", "lawn6",
        ],
        "loops": 2,
        "sub": "再去草坪上玩一会儿。",
    },
    {
        "frames": ["dinner1", "dinner3", "dinner1", "dinner2", "dinner3", "dinner1"],
        "loops": 3,
        "sub": "傍晚，又进了厨房。",
    },
    {
        "frames": ["rest1", "rest1", "rest1", "rest1", "rest1", "rest1"],
        "loops": 3,
        "sub": "这一天，可以歇歇了。",
        "end": True,
    },
]


def run(cmd):
    subprocess.run(cmd, check=True)


def still(name):
    path = DAY / f"{name}.jpg"
    if not path.exists():
        raise FileNotFoundError(path)
    return path


def probe_duration(path):
    out = subprocess.check_output(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=nk=1:nw=1",
            str(path),
        ],
        text=True,
    )
    return float(out.strip())


def make_scene(index, scene):
    listing = WORK / f"scene{index:02d}.txt"
    lines = []
    sequence = scene["frames"] * scene.get("loops", 1)
    for name in sequence:
        lines.append(f"file '{still(name)}'")
        lines.append(f"duration {HOLD}")
    lines.append(f"file '{still(sequence[-1])}'")
    listing.write_text("\n".join(lines) + "\n", encoding="utf-8")

    duration = HOLD * len(sequence)
    raw = WORK / f"scene{index:02d}-raw.mp4"
    run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listing),
        "-fps_mode", "cfr", "-r", str(FPS), "-pix_fmt", "yuv420p",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
        str(raw),
    ])

    vf = (
        f"scale=1280:720,setsar=1,"
        f"fade=t=in:st=0:d=0.45,fade=t=out:st={max(duration - 0.5, 0.2)}:d=0.45"
    )
    extras = []
    if scene.get("title"):
        extras.append(
            f"drawtext=fontfile={FONT}:text='{scene['title']}':fontsize=52:fontcolor=white:"
            f"x=(w-text_w)/2:y=h*0.12:shadowcolor=black@0.5:shadowx=3:shadowy=3:"
            f"enable='between(t,0,2.4)'"
        )
    if scene.get("end"):
        extras.append(
            f"drawtext=fontfile={FONT}:text='终':fontsize=22:fontcolor=0xC9B79A:"
            f"x=(w-text_w)/2:y=(h-text_h)/2-70:shadowcolor=black@0.45:shadowx=2:shadowy=2:"
            f"enable='gte(t,{max(duration - 2.2, 0)})'"
        )
        extras.append(
            f"drawtext=fontfile={FONT}:text='妈妈的一天':fontsize=36:fontcolor=white:"
            f"x=(w-text_w)/2:y=(h-text_h)/2-10:shadowcolor=black@0.45:shadowx=3:shadowy=3:"
            f"enable='gte(t,{max(duration - 2.2, 0)})'"
        )
    if extras:
        vf += "," + ",".join(extras)

    out = WORK / f"scene{index:02d}.mp4"
    run([
        "ffmpeg", "-y", "-i", str(raw), "-vf", vf,
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "22",
        str(out),
    ])
    duration = probe_duration(out)
    return out, duration


def write_srt(durations):
    def stamp(ms):
        h = int(ms // 3600000)
        m = int(ms % 3600000 // 60000)
        s = int(ms % 60000 // 1000)
        milli = int(ms % 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{milli:03d}"

    t = 0.0
    lines = []
    n = 1
    for scene, duration in zip(SCENES, durations):
        sub = scene.get("sub")
        if sub:
            start = t + 0.45
            end = t + duration - 0.4
            lines.append(str(n))
            lines.append(f"{stamp(start * 1000)} --> {stamp(end * 1000)}")
            lines.append(sub)
            lines.append("")
            n += 1
        t += duration
    path = WORK / "film.srt"
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def main():
    WORK.mkdir(exist_ok=True)
    wav = ASSETS / "lullaby.wav"
    if not wav.exists():
        run(["python3", str(ROOT / "make_lullaby.py")])

    clips = []
    durations = []
    for i, scene in enumerate(SCENES):
        clip, duration = make_scene(i, scene)
        clips.append(clip)
        durations.append(duration)

    listing = WORK / "concat.txt"
    listing.write_text("".join(f"file '{clip}'\n" for clip in clips), encoding="utf-8")
    silent = WORK / "silent.mp4"
    run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listing),
        "-c", "copy", str(silent),
    ])
    srt = write_srt(durations)
    subtitled = WORK / "subtitled.mp4"
    run([
        "ffmpeg", "-y", "-i", str(silent),
        "-vf", (
            f"subtitles='{srt}':force_style='FontName=Droid Sans Fallback,FontSize=22,"
            f"PrimaryColour=&H00EAF4F6,OutlineColour=&H80000000,BorderStyle=1,"
            f"Outline=1,Shadow=0,Alignment=2,MarginV=42'"
        ),
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "22",
        str(subtitled),
    ])
    total = sum(durations)
    fade_out_at = max(total - 4.0, 1)
    run([
        "ffmpeg", "-y",
        "-i", str(subtitled),
        "-stream_loop", "-1", "-i", str(wav),
        "-shortest",
        "-af", f"afade=t=in:st=0:d=1.2,afade=t=out:st={fade_out_at}:d=3",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
        "-aspect", "16:9",
        str(OUT),
    ])
    print("wrote", OUT, "seconds", round(total, 1))


if __name__ == "__main__":
    main()
