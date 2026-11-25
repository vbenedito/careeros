"""Original lo-fi music bed for CareerOS videos, synthesized in code (no samples, no license needed).

    python3 careeros_music.py --seconds 30.5 --out bed.wav [--seed 1]

80 BPM, 4/4, progression Fmaj7 - Em7 - Dm7 - Cmaj7. Layers: warm pad, FM electric piano,
sine bass, soft drums (kick, rim, swung hats), faint vinyl noise, small room reverb.
Drums enter after the first bar, so the hook screen starts calm; the last chord rings out.
"""
from __future__ import annotations

import argparse
import wave

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
BPM = 80
BEAT = 60 / BPM
BAR = 4 * BEAT

CHORDS = [  # MIDI notes (voicing), bass root
    ([53, 57, 60, 64], 41),  # Fmaj7
    ([52, 55, 59, 62], 40),  # Em7
    ([50, 53, 57, 60], 38),  # Dm7
    ([48, 52, 55, 59], 36),  # Cmaj7
]


def hz(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def env_adsr(n: int, a: float, d: float, s: float, r: float, hold: float) -> np.ndarray:
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-4), 1.0)
    e = np.where((t >= a) & (t < a + d), 1 - (1 - s) * (t - a) / max(d, 1e-4), e)
    e = np.where(t >= a + d, s, e)
    rel = np.clip((t - hold) / max(r, 1e-4), 0, 1)
    return e * (1 - rel)


def add(buf: np.ndarray, sig: np.ndarray, start_s: float, pan: float = 0.0, gain: float = 1.0):
    i = int(start_s * SR)
    if i >= buf.shape[1]:
        return
    sig = sig[: buf.shape[1] - i] * gain
    lg, rg = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[0, i : i + len(sig)] += sig * lg
    buf[1, i : i + len(sig)] += sig * rg


def pad_note(f: float, dur: float, rng) -> np.ndarray:
    n = int((dur + 1.4) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for det in (-0.004, 0.0, 0.0045):
        ph = rng.uniform(0, 2 * np.pi)
        for k in range(1, 7):
            out += np.sin(2 * np.pi * f * (1 + det) * k * t + ph * k) / k ** 1.6
    trem = 1 + 0.06 * np.sin(2 * np.pi * 0.21 * t + rng.uniform(0, 6))
    return out * trem * env_adsr(n, 0.7, 0.5, 0.8, 1.3, dur)


def epiano(f: float, vel: float) -> np.ndarray:
    n = int(2.2 * SR)
    t = np.arange(n) / SR
    idx = 1.6 * np.exp(-t * 3.0)
    mod = np.sin(2 * np.pi * f * t) * idx
    car = np.sin(2 * np.pi * f * t + mod) + 0.15 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * 6)
    return car * np.exp(-t * 1.6) * np.minimum(1, t / 0.004) * vel


def bass(f: float, dur: float) -> np.ndarray:
    n = int((dur + 0.3) * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t)
    return s * env_adsr(n, 0.015, 0.4, 0.6, 0.25, dur)


def kick() -> np.ndarray:
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 46 + 70 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 7.5) * np.minimum(1, t / 0.002)


def rim(rng) -> np.ndarray:
    n = int(0.18 * SR)
    t = np.arange(n) / SR
    noise = sosfilt(butter(2, [900, 4200], "bandpass", fs=SR, output="sos"), rng.standard_normal(n))
    return (0.7 * noise * np.exp(-t * 28) + 0.5 * np.sin(2 * np.pi * 190 * t) * np.exp(-t * 35))


def hat(rng, open_: bool = False) -> np.ndarray:
    n = int((0.25 if open_ else 0.07) * SR)
    t = np.arange(n) / SR
    noise = sosfilt(butter(4, 7000, "highpass", fs=SR, output="sos"), rng.standard_normal(n))
    return noise * np.exp(-t * (12 if open_ else 55))


def reverb(x: np.ndarray, rng, seconds: float = 1.8, wet: float = 0.22) -> np.ndarray:
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal((2, n)) * np.exp(-t * 3.2)
    ir = sosfilt(butter(1, 5000, "lowpass", fs=SR, output="sos"), ir)
    ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
    out = np.stack([fftconvolve(x[c], ir[c])[: x.shape[1]] for c in range(2)])
    return x * (1 - wet) + out * wet * 2.2


def render(seconds: float, seed: int = 1) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    music = np.zeros((2, n))  # pad + keys (reverb send)
    rhythm = np.zeros((2, n))
    bars = int(np.ceil(seconds / BAR))
    drums_from, drums_until = 1, bars - 1  # calm first bar, last chord rings out
    swing = 0.58
    for b in range(bars):
        notes, root = CHORDS[b % len(CHORDS)]
        if b == bars - 1:
            notes, root = CHORDS[3]  # end on the home chord
        t0 = b * BAR
        last = b == bars - 1
        dur = min(BAR, seconds - t0) if last else BAR
        for j, m in enumerate(notes):
            add(music, pad_note(hz(m), dur, rng), t0, pan=(j - 1.5) * 0.35, gain=0.055)
        # electric piano: broken chord on beat 1, two soft offbeat tones
        for j, m in enumerate(notes):
            add(music, epiano(hz(m + 12), 0.9 - 0.12 * j), t0 + 0.018 * j, pan=0.15, gain=0.085)
        if not last:
            for beat, m in ((2 + swing, notes[3] + 12), (3 + swing, notes[2] + 12)):
                add(music, epiano(hz(m), 0.55), t0 + beat * BEAT, pan=-0.2, gain=0.07)
        # bass: root on 1, fifth-ish on 3
        add(rhythm, bass(hz(root), BEAT * 1.8), t0, gain=0.22)
        if not last:
            add(rhythm, bass(hz(root + 7), BEAT * 0.9), t0 + 2.5 * BEAT, gain=0.16)
        if drums_from <= b < drums_until:
            for beat in (0, 2):
                add(rhythm, kick(), t0 + beat * BEAT, gain=0.42)
            if b % 2 == 1:
                add(rhythm, kick(), t0 + (2 + swing) * BEAT, gain=0.25)
            for beat in (1, 3):
                add(rhythm, rim(rng), t0 + beat * BEAT, pan=0.1, gain=0.16)
            for e in range(8):
                pos = (e // 2) + (swing if e % 2 else 0)
                add(rhythm, hat(rng, open_=(e == 7 and b % 4 == 3)), t0 + pos * BEAT, pan=0.3, gain=0.05 if e % 2 else 0.07)
    # gentle ducking of the music under each kick
    duck = np.ones(n)
    for b in range(drums_from, drums_until):
        for beat in (0, 2):
            i = int((b * BAR + beat * BEAT) * SR)
            k = np.arange(min(int(0.35 * SR), n - i)) / SR
            duck[i : i + len(k)] *= 1 - 0.22 * np.exp(-k * 9)
    music = reverb(music * duck, rng)
    mix = music + rhythm
    # vinyl: very faint noise and sparse crackle
    vin = sosfilt(butter(2, [300, 6000], "bandpass", fs=SR, output="sos"), rng.standard_normal((2, n))) * 0.004
    crackle = (rng.random((2, n)) > 0.99985) * rng.standard_normal((2, n)) * 0.05
    mix += vin + crackle
    # warm master: low-pass, soft saturation, fades
    mix = sosfilt(butter(2, 9500, "lowpass", fs=SR, output="sos"), mix)
    mix = np.tanh(mix * 1.6) / 1.6
    t = np.arange(n) / SR
    fade = np.clip(t / 0.05, 0, 1) * np.clip((seconds - t) / 1.6, 0, 1)
    mix *= fade
    return mix / (np.abs(mix).max() + 1e-9) * 0.89  # about -1 dBFS peak; loudness set by ffmpeg


def write_wav(path: str, x: np.ndarray):
    pcm = (np.clip(x.T, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=float, default=30.5)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--out", default="bed.wav")
    a = ap.parse_args()
    write_wav(a.out, render(a.seconds, a.seed))
    print(a.out)
