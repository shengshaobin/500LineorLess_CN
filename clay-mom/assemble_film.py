#!/usr/bin/env python3
"""Assemble a 9:16 Douyin dance short from stop-motion stills."""
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).parent
ASSETS = ROOT / "assets"
DANCE = ASSETS / "dance"
WORK = ROOT / ".film-build"
OUT = ROOT / "film.mp4"
FONT = "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf"
FPS = 24
W, H = 720, 1280

# 120 BPM: one 8th note = 6 frames. Hook sits still, then the beat drops.
HOOK_FRAMES = 36          # 1.5s still T-pose
POSE_FRAMES = 6           # 0.25s per pose
FAST_FRAMES = 3          # double-time
FREEZE_FRAMES = 60       # 2.5s freeze

# Same lawn, same figure — only the pose changes.
CYCLE = ["d2", "d3", "d4", "d6", "d5", "d4", "d3", "d7"]


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


def emit(src, nframes, dest_dir, start):
    src = DANCE / f"{src}.jpg"
    for i in range(nframes):
        target = dest_dir / f"{start + i:05d}.jpg"
        if target.exists() or target.is_symlink():
            target.unlink()
        os.link(src, target)
    return start + nframes


def build_frame_sequence(dest_dir):
    if dest_dir.exists():
        shutil.rmtree(dest_dir)
    dest_dir.mkdir(parents=True)

    frame = 0
    frame = emit("d1", HOOK_FRAMES, dest_dir, frame)
    for _ in range(4):
        for pose in CYCLE:
            frame = emit(pose, POSE_FRAMES, dest_dir, frame)
    for _ in range(2):
        for pose in CYCLE:
            frame = emit(pose, FAST_FRAMES, dest_dir, frame)
    frame = emit("d8", FREEZE_FRAMES, dest_dir, frame)
    return frame


def main():
    if WORK.exists():
        shutil.rmtree(WORK)
    WORK.mkdir()

    wav = ASSETS / "bgm.wav"
    run(["python3", str(ROOT / "make_bgm.py")])

    frames_dir = WORK / "frames"
    total_frames = build_frame_sequence(frames_dir)
    drop_t = HOOK_FRAMES / FPS
    freeze_t = (total_frames - FREEZE_FRAMES) / FPS
    total_t = total_frames / FPS

    # Hard cuts between stills = stop-motion dance. A 2-frame brightness
    # flash marks the drop; a slow push-in sells the freeze.
    vf = (
        f"scale={W}:{H},"
        f"eq=brightness='if(between(t,{drop_t:.3f},{drop_t + 0.08:.3f}),0.16,0)',"
        f"drawtext=fontfile={FONT}:text='儿子捏的，也会跳':fontsize=36:"
        f"fontcolor=white:x=(w-text_w)/2:y=h*0.10:"
        f"shadowcolor=black@0.55:shadowx=3:shadowy=3:"
        f"enable='gte(t,{freeze_t + 0.35:.3f})',"
        f"setsar=1,format=yuv420p"
    )

    silent = WORK / "silent.mp4"
    run([
        "ffmpeg", "-y",
        "-framerate", str(FPS),
        "-i", str(frames_dir / "%05d.jpg"),
        "-vf", vf,
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-preset", "veryfast", "-crf", "20",
        "-t", f"{total_t:.4f}",
        str(silent),
    ])

    total = probe_duration(silent)
    fade_out_at = max(total - 0.9, 1)
    run([
        "ffmpeg", "-y",
        "-i", str(silent),
        "-i", str(wav),
        "-shortest",
        "-af", f"afade=t=out:st={fade_out_at}:d=0.85,volume=1.12",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-aspect", "9:16",
        str(OUT),
    ])
    print("wrote", OUT, "seconds", round(total, 1), "frames", total_frames)


if __name__ == "__main__":
    main()
