"""Trilha dos vídeos tutoriais, sintetizada do zero (sem arquivos de terceiros).
Uso: python3 som.py eventos.json duracao saida.wav [semente]
Efeitos: clique, tecla, cola, pop, passo, sucesso, toggle, abre, whoosh, envia, recebe, final.
Fundo: um pad suave com arpejo leve, bem baixo, com fade no começo e no fim.
"""
import json
import sys
import wave

import numpy as np

SR = 44100
rng = np.random.default_rng(int(sys.argv[4]) if len(sys.argv) > 4 else 7)


def t_(seg):
    return np.arange(int(seg * SR)) / SR


def env(n, ataque=0.002, queda=0.05):
    t = np.arange(n) / SR
    a = np.clip(t / max(ataque, 1e-4), 0, 1)
    return a * np.exp(-np.maximum(t - ataque, 0) / queda)


def faixa(x, lo, hi):
    """filtro passa-faixa por FFT (bom para sons curtos)"""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    m = ((f >= lo) & (f <= hi)).astype(float)
    # bordas suaves
    m = np.convolve(m, np.hanning(31) / np.hanning(31).sum(), mode='same')
    return np.fft.irfft(X * m, len(x))


def seno(freq0, freq1, seg, harm=((1, 1.0),)):
    n = int(seg * SR)
    f = np.linspace(freq0, freq1, n)
    fase = 2 * np.pi * np.cumsum(f) / SR
    return sum(a * np.sin(h * fase) for h, a in harm)


def norm(x):
    p = np.max(np.abs(x)) or 1
    return x / p


# ---------- efeitos ----------
def clique():
    n = int(0.06 * SR)
    tick = faixa(rng.standard_normal(n), 2500, 7000) * env(n, 0.0005, 0.004)
    corpo = seno(1700, 1300, 0.06) * env(n, 0.0008, 0.012)
    baque = seno(180, 110, 0.06) * env(n, 0.001, 0.02)
    return norm(0.7 * norm(tick) + 0.35 * corpo + 0.5 * baque) * 0.42


def tecla():
    n = int(0.035 * SR)
    lo = rng.uniform(1800, 2600)
    tick = faixa(rng.standard_normal(n), lo, lo * 2.4) * env(n, 0.0004, 0.005)
    corpo = seno(rng.uniform(900, 1200), 700, 0.035) * env(n, 0.0005, 0.006)
    return norm(norm(tick) + 0.3 * corpo) * rng.uniform(0.10, 0.16)


def cola():
    a = clique() * 0.55
    b = pop()
    off = int(0.05 * SR)
    out = np.zeros(off + len(b))
    out[: len(a)] += a
    out[off:] += b
    return out


def pop():
    s = 0.09
    x = seno(520, 900, s, ((1, 1.0), (2, 0.15))) * env(int(s * SR), 0.003, 0.03)
    return x * 0.22


def passo():
    s = 0.6
    x = seno(784, 784, s, ((1, 1.0), (2, 0.25), (4, 0.06))) * env(int(s * SR), 0.004, 0.14)
    return x * 0.13


def sino(f, s=0.9, g=0.2):
    return seno(f, f, s, ((1, 1.0), (2, 0.22), (3, 0.08))) * env(int(s * SR), 0.003, 0.22) * g


def sucesso():
    a = sino(1046.5, g=0.16)
    b = sino(1568.0, g=0.16)
    off = int(0.09 * SR)
    out = np.zeros(len(b) + off)
    out[: len(a)] += a
    out[off:] += b
    return out


def toggle():
    x = clique() * 0.6
    y = seno(700, 1000, 0.05) * env(int(0.05 * SR), 0.002, 0.015) * 0.12
    out = np.zeros(max(len(x), len(y)))
    out[: len(x)] += x
    out[: len(y)] += y
    return out


def whoosh(seg=0.65, g=0.2):
    n = int(seg * SR)
    ruido = rng.standard_normal(n)
    t = np.arange(n) / n
    out = np.zeros(n)
    # três faixas que entram em sequência: a sensação de "passar"
    for i, (lo, hi) in enumerate(((250, 900), (700, 2200), (1800, 5000))):
        centro = 0.35 + i * 0.12
        e = np.exp(-((t - centro) ** 2) / (2 * 0.13 ** 2))
        out += faixa(ruido, lo, hi) * e * (1.0 - 0.25 * i)
    return norm(out) * g


def abre():
    return whoosh(0.32, 0.09)


def envia():
    s = 0.12
    return seno(650, 1150, s, ((1, 1.0), (2, 0.1))) * env(int(s * SR), 0.004, 0.04) * 0.17


def recebe():
    a = sino(988, 0.35, 0.15)
    b = sino(1319, 0.45, 0.15)
    off = int(0.11 * SR)
    out = np.zeros(len(b) + off)
    out[: len(a)] += a
    out[off:] += b
    return out


def final():
    notas = [523.25, 659.25, 783.99, 1046.5]
    out = np.zeros(int(1.8 * SR))
    for i, f in enumerate(notas):
        x = sino(f, 1.4, 0.13)
        o = int(i * 0.08 * SR)
        out[o:o + len(x)] += x
    return out


EFEITOS = {
    'clique': clique, 'tecla': tecla, 'cola': cola, 'pop': pop, 'passo': passo, 'sucesso': sucesso,
    'toggle': toggle, 'abre': abre, 'whoosh': whoosh, 'envia': envia, 'recebe': recebe, 'final': final,
}


# ---------- fundo musical ----------
def nota(f, seg, ataque=0.9, solta=1.2):
    n = int(seg * SR)
    t = np.arange(n) / SR
    voz = np.zeros(n)
    for det in (0.9985, 1.0, 1.0015):  # leve coro
        fase = 2 * np.pi * f * det * t
        voz += np.sin(fase) + 0.3 * np.sin(2 * fase) + 0.08 * np.sin(3 * fase)
    e = np.clip(t / ataque, 0, 1) * np.clip((seg - t) / solta, 0, 1)
    return voz * e / 3


def soma(out, o, x):
    if o >= len(out):
        return
    x = x[: len(out) - o]
    out[o:o + len(x)] += x


def fundo(dur):
    n = int(dur * SR)
    out = np.zeros(n + SR * 3)
    hz = lambda m: 440 * 2 ** ((m - 69) / 12)
    # Dmaj9 → Bm7 → Gmaj7 → A6sus (em loop), 4 s cada
    acordes = [[50, 57, 61, 64, 66], [47, 54, 57, 62, 66], [43, 50, 54, 59, 62], [45, 52, 57, 59, 64]]
    seg = 4.0
    i = 0
    t0 = 0.0
    while t0 < dur:
        ac = acordes[i % len(acordes)]
        for m in ac:
            soma(out, int(t0 * SR), nota(hz(m), seg + 1.2) * 0.045)
        # arpejo leve em colcheias
        arp = [ac[2] + 12, ac[3] + 12, ac[4] + 12, ac[3] + 12]
        for k in range(8):
            f = hz(arp[k % len(arp)])
            s = 0.7
            x = (np.sin(2 * np.pi * f * t_(s)) + 0.2 * np.sin(4 * np.pi * f * t_(s))) * env(int(s * SR), 0.004, 0.18) * 0.022
            soma(out, int((t0 + k * 0.5) * SR), x)
        t0 += seg
        i += 1
    out = out[:n]
    # fade de entrada e saída
    tt = np.arange(n) / SR
    out *= np.clip(tt / 1.5, 0, 1) * np.clip((dur - tt) / 2.5, 0, 1)
    return out


def sala(x, mix=0.22):
    """reverberação simples: ecos curtos somados"""
    y = x.copy()
    for ms, g in ((23, 0.5), (41, 0.38), (67, 0.3), (97, 0.22), (131, 0.16), (173, 0.11)):
        d = int(ms / 1000 * SR)
        y[d:] += x[:-d] * g * mix * 2
    return y


def main():
    eventos = json.load(open(sys.argv[1]))
    dur = float(sys.argv[2])
    n = int((dur + 2) * SR)
    sfx = np.zeros(n)
    for e in eventos:
        x = EFEITOS[e['tipo']]()
        o = int(max(0, e['t']) * SR)
        if o >= n:
            continue
        x = x[: n - o]
        sfx[o:o + len(x)] += x
    sfx = sala(sfx, 0.18)
    mus = sala(fundo(dur), 0.35) * 0.55
    mix = sfx + np.pad(mus, (0, n - len(mus)))
    mix = mix[: int(dur * SR)]
    mix = np.tanh(mix * 1.3) / np.tanh(1.3)
    mix = mix / (np.max(np.abs(mix)) or 1) * 0.89
    pcm = (mix * 32767).astype(np.int16)
    with wave.open(sys.argv[3], 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


if __name__ == '__main__':
    main()
