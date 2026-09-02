#!/usr/bin/env python3
"""Assemble a smooth 9:16 Douyin short of Mom's day."""
import subprocess
from pathlib import Path

ROOT = Path(__file__).parent
ASSETS = ROOT / "assets"
VERT = ASSETS / "v"
WORK = ROOT / ".film-build"
OUT = ROOT / "film.mp4"
FONT = "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf"
FPS = 24
XFADE = 0.85
W, H = 720, 1280

# One still per shot, held long, then dissolved to the next. No rapid cutting.
SHOTS = [
    {"src": "v-stretch", "dur": 3.4, "ken": "in", "title": True,
     "sub": None},
    {"src": "v-walk", "dur": 2.8, "ken": "out",
     "sub": "早上，先伸个懒腰"},
    {"src": "v-cook1", "dur": 3.2, "ken": "in",
     "sub": "早饭得自己做"},
    {"src": "v-cook2", "dur": 2.8, "ken": "out",
     "sub": "早饭得自己做"},
    {"src": "v-cook3", "dur": 2.8, "ken": "in",
     "sub": "早饭得自己做"},
    {"src": "v-work1", "dur": 3.2, "ken": "out",
     "sub": "坐下来，把工作做完"},
    {"src": "v-work2", "dur": 2.6, "ken": "in",
     "sub": "坐下来，把工作做完"},
    {"src": "v-lawn1", "dur": 3.0, "ken": "out",
     "sub": "再去草坪上玩一会儿"},
    {"src": "v-lawn2", "dur": 2.8, "ken": "in",
     "sub": "再去草坪上玩一会儿"},
    {"src": "v-lawn4", "dur": 3.0, "ken": "out",
     "sub": "再去草坪上玩一会儿"},
    {"src": "v-dinner", "dur": 3.2, "ken": "in",
     "sub": "傍晚，又进了厨房"},
    {"src": "v-rest", "dur": 4.2, "ken": "in", "end": True,
     "sub": "这一天，可以歇歇了"},
]


def run(cmd):
    subprocess.run(cmd, check=True)


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


def make_clip(index, shot):
    frames = int(round(shot["dur"] * FPS))
    zoom = (
        "min(1.0+0.00028*on,1.07)"
        if shot["ken"] == "in"
        else "if(lte(on,1),1.07,max(1.07-0.00028*on,1.0))"
    )
    vf = (
        f"scale=900:1600,"
        f"zoompan=z='{zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
        f"d={frames}:s={W}x{H}:fps={FPS},"
        f"setsar=1,format=yuv420p"
    )
    extras = []
    if shot.get("title"):
        extras.append(
            f"drawtext=fontfile={FONT}:text='妈妈的一天':fontsize=46:fontcolor=white:"
            f"x=(w-text_w)/2:y=h*0.10:shadowcolor=black@0.55:shadowx=3:shadowy=3"
        )
        extras.append(
            f"drawtext=fontfile={FONT}:text='一部粘土短片':fontsize=20:fontcolor=0xE8D7BE:"
            f"x=(w-text_w)/2:y=h*0.10+62:shadowcolor=black@0.45:shadowx=2:shadowy=2"
        )
    if shot.get("end"):
        extras.append(
            f"drawtext=fontfile={FONT}:text='终':fontsize=22:fontcolor=0xE8D7BE:"
            f"x=(w-text_w)/2:y=h*0.12:shadowcolor=black@0.5:shadowx=2:shadowy=2:"
            f"enable='gte(t,{shot['dur'] - 1.8})'"
        )
    if extras:
        vf += "," + ",".join(extras)

    src = VERT / f"{shot['src']}.jpg"
    out = WORK / f"clip{index:02d}.mp4"
    run([
        "ffmpeg", "-y", "-loop", "1", "-i", str(src),
        "-t", str(shot["dur"]), "-vf", vf,
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-preset", "veryfast", "-crf", "21",
        str(out),
    ])
    return out


def xfade_all(clips, durs):
    if len(clips) == 1:
        return clips[0]
    inputs = []
    for clip in clips:
        inputs.extend(["-i", str(clip)])
    parts = []
    last = "[0]"
    total = durs[0]
    for i in range(1, len(clips)):
        offset = total - XFADE
        label = f"[v{i}]"
        parts.append(
            f"{last}[{i}]xfade=transition=fade:duration={XFADE}:offset={offset:.3f}{label}"
        )
        last = label
        total = total + durs[i] - XFADE
    filter_complex = ";".join(parts)
    out = WORK / "xfade.mp4"
    run([
        "ffmpeg", "-y", *inputs,
        "-filter_complex", filter_complex,
        "-map", last,
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-preset", "veryfast", "-crf", "21",
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
    blocks = []
    n = 1
    last_text = None
    span_start = None
    span_end = None

    def flush():
        nonlocal n, last_text, span_start, span_end
        if last_text:
            blocks.append(str(n))
            blocks.append(f"{stamp(span_start * 1000)} --> {stamp(span_end * 1000)}")
            blocks.append(last_text)
            blocks.append("")
            n += 1

    for i, shot in enumerate(SHOTS):
        start = t + 0.35
        end = t + shot["dur"] - 0.25
        text = shot.get("sub")
        if text:
            if text == last_text:
                span_end = end
            else:
                if last_text:
                    span_end = min(span_end, start - 0.05)
                flush()
                last_text = text
                span_start = start
                span_end = end
        if i < len(SHOTS) - 1:
            t = t + shot["dur"] - XFADE
        else:
            t = t + shot["dur"]
    flush()
    path = WORK / "film.srt"
    path.write_text("\n".join(blocks), encoding="utf-8")
    return path


def main():
    WORK.mkdir(exist_ok=True)
    wav = ASSETS / "lullaby.wav"
    if not wav.exists():
        run(["python3", str(ROOT / "make_lullaby.py")])

    clips = []
    durs = []
    for i, shot in enumerate(SHOTS):
        clip = make_clip(i, shot)
        clips.append(clip)
        durs.append(shot["dur"])

    silent = xfade_all(clips, durs)
    srt = write_srt()
    subtitled = WORK / "subtitled.mp4"
    run([
        "ffmpeg", "-y", "-i", str(silent),
        "-vf", (
            f"subtitles='{srt}':force_style='FontName=Droid Sans Fallback,FontSize=20,"
            f"PrimaryColour=&H00F4F0E8,OutlineColour=&H90000000,BorderStyle=1,"
            f"Outline=1,Shadow=0,Alignment=2,MarginV=160'"
        ),
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-preset", "veryfast", "-crf", "21",
        str(subtitled),
    ])
    total = probe_duration(subtitled)
    fade_out_at = max(total - 3.5, 1)
    run([
        "ffmpeg", "-y",
        "-i", str(subtitled),
        "-stream_loop", "-1", "-i", str(wav),
        "-shortest",
        "-af", f"afade=t=in:st=0:d=1.1,afade=t=out:st={fade_out_at}:d=3",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
        "-aspect", "9:16",
        str(OUT),
    ])
    print("wrote", OUT, "seconds", round(total, 1))


if __name__ == "__main__":
    main()
