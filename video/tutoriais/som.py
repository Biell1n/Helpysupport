#!/usr/bin/env python3
"""Trilha dos vídeos tutoriais do Helpy (efeitos + música), sintetizada do zero.

Uso: python3 som.py eventos.json duracao saida.wav [semente]

Tudo é gerado aqui (só numpy + biblioteca padrão; nenhum sample de terceiros).
Efeitos: clique, tecla, cola, pop, passo, sucesso, toggle, abre, whoosh, envia, recebe, final.
Música: lo-fi / "corporate soft" em Ré maior (piano elétrico FM, baixo macio, pad,
pluck, shaker/hat/kick abafado discretos), BPM fixo escolhido para que o evento
"final" caia exatamente num tempo forte e resolva na tônica.
Saída: WAV estéreo 44,1 kHz 16 bits, ~-16 LUFS integrado, true-peak <= -1 dBTP.
Medidas vão para stderr (a saída padrão fica vazia, como antes).
"""
import json
import math
import os
import sys
import wave

import numpy as np

SR = 44100
ALVO_LUFS = -16.0
TETO_DBTP = -1.3          # margem sobre -1 dBTP (o AAC do montar.sh cria picos novos)


# =====================================================================
# DSP básico
# =====================================================================
def db2a(d):
    return 10.0 ** (d / 20.0)


def a2db(a):
    return 20.0 * np.log10(np.maximum(a, 1e-12))


def hz(m):
    return 440.0 * 2.0 ** ((m - 69) / 12.0)


def rbj(tipo, f, q=0.7071, ganho=0.0):
    """Coeficientes biquad (RBJ cookbook). Retorna (b, a) normalizados."""
    f = min(max(f, 5.0), 0.45 * SR)
    w = 2 * math.pi * f / SR
    cw, sw = math.cos(w), math.sin(w)
    al = sw / (2 * q)
    A = 10 ** (ganho / 40)
    if tipo == 'lp':
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]; a = [1 + al, -2 * cw, 1 - al]
    elif tipo == 'hp':
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]; a = [1 + al, -2 * cw, 1 - al]
    elif tipo == 'bp':
        b = [al, 0.0, -al]; a = [1 + al, -2 * cw, 1 - al]
    elif tipo == 'pico':
        b = [1 + al * A, -2 * cw, 1 - al * A]; a = [1 + al / A, -2 * cw, 1 - al / A]
    elif tipo in ('ls', 'hs'):
        s = 2 * math.sqrt(A) * al
        if tipo == 'ls':
            b = [A * ((A + 1) - (A - 1) * cw + s), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - s)]
            a = [(A + 1) + (A - 1) * cw + s, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - s]
        else:
            b = [A * ((A + 1) + (A - 1) * cw + s), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - s)]
            a = [(A + 1) - (A - 1) * cw + s, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - s]
    else:
        raise ValueError(tipo)
    return [x / a[0] for x in b], [1.0, a[1] / a[0], a[2] / a[0]]


_RESP = {}


def _respostas(b, a, L):
    """Resposta ao impulso (h) e respostas livres a cada variável de estado (g1, g2), comprimento L."""
    chave = (tuple(b), tuple(a), L)
    if chave in _RESP:
        return _RESP[chave]
    b0, b1, b2 = b
    a1, a2 = a[1], a[2]
    out = []
    for x0, s1, s2 in ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0)):
        y = [0.0] * L
        xi = x0
        for i in range(L):
            yi = b0 * xi + s1
            s1 = b1 * xi - a1 * yi + s2
            s2 = b2 * xi - a2 * yi
            y[i] = yi
            xi = 0.0
        out.append(np.array(y))
    if len(_RESP) > 400:
        _RESP.clear()
    _RESP[chave] = out
    return out


def biquad(x, ba):
    """Filtro IIR de 2ª ordem EXATO, vetorizado por blocos.

    Cada bloco = resposta de estado zero (convolução FFT com h truncada em L, exata dentro
    do bloco) + combinação linear das respostas livres g1/g2 ao estado herdado do bloco
    anterior. Só a propagação do estado (2 números por bloco) é sequencial.
    """
    x = np.asarray(x, dtype=float)
    if x.ndim == 2:
        return np.stack([biquad(c, ba) for c in x])
    b, a = ba
    b0, b1, b2 = b
    a1, a2 = a[1], a[2]
    N = len(x)
    if N == 0:
        return x.copy()
    L = 256 if N < 4096 else (1024 if N < 65536 else 4096)
    nb = -(-N // L)
    X = np.zeros(nb * L)
    X[:N] = x
    X = X.reshape(nb, L)
    h, g1, g2 = _respostas((b0, b1, b2), (1.0, a1, a2), L)
    F = 2 * L
    Z = np.fft.irfft(np.fft.rfft(X, F, axis=1) * np.fft.rfft(h, F), F, axis=1)[:, :L]
    z1, z2 = Z[:, -1].tolist(), Z[:, -2].tolist()
    x1, x2 = X[:, -1].tolist(), X[:, -2].tolist()
    G11, G12, G21, G22 = g1[-1], g1[-2], g2[-1], g2[-2]
    S1 = np.empty(nb); S2 = np.empty(nb)
    s1 = s2 = 0.0
    for k in range(nb):
        S1[k] = s1; S2[k] = s2
        y1 = z1[k] + s1 * G11 + s2 * G21
        y2 = z2[k] + s1 * G12 + s2 * G22
        s1, s2 = b1 * x1[k] - a1 * y1 + b2 * x2[k] - a2 * y2, b2 * x1[k] - a2 * y1
    Y = Z + S1[:, None] * g1 + S2[:, None] * g2
    return Y.ravel()[:N]


def lp(x, f, q=0.7071):
    return biquad(x, rbj('lp', f, q))


def hp(x, f, q=0.7071):
    return biquad(x, rbj('hp', f, q))


def bp(x, f, q=1.0):
    return biquad(x, rbj('bp', f, q))


def env(n, ataque, queda, curva=1.0):
    """Envelope ataque linear (formato seno²) + queda exponencial."""
    t = np.arange(n) / SR
    a = np.clip(t / max(ataque, 1e-5), 0, 1)
    a = np.sin(a * np.pi / 2) ** 2
    d = np.exp(-np.maximum(t - ataque, 0) / queda) ** curva
    return a * d


def osc(freq, n, fase0=0.0):
    """Seno com frequência constante ou trajetória (array)."""
    if np.isscalar(freq):
        return np.sin(2 * np.pi * freq * np.arange(n) / SR + fase0)
    return np.sin(2 * np.pi * np.cumsum(freq[:n]) / SR + fase0)


def pan(x, p):
    """Pan de potência constante; p em [-1, 1]; centro = ganho 1 nos dois lados."""
    th = (p + 1) * np.pi / 4
    return np.stack([x * math.cos(th) * math.sqrt(2), x * math.sin(th) * math.sqrt(2)])


def pico1(x):
    m = np.max(np.abs(x))
    return x / m if m > 0 else x


def soma(buf, i0, x):
    """Soma x (mono ou estéreo) em buf (2, N) a partir da amostra i0, cortando bordas."""
    if x.ndim == 1:
        x = np.stack([x, x])
    n = x.shape[1]
    if i0 < 0:
        x = x[:, -i0:]; n = x.shape[1]; i0 = 0
    if i0 >= buf.shape[1] or n <= 0:
        return
    n = min(n, buf.shape[1] - i0)
    buf[:, i0:i0 + n] += x[:, :n]


def atrasa(x, d):
    if d <= 0:
        return x
    return np.concatenate([np.zeros(d), x[:-d]]) if d < len(x) else np.zeros_like(x)


# ---------- min / média deslizantes (limiter) ----------
def min_frente(r, W):
    """min de r[n .. n+W-1] (fora do sinal = 1)."""
    W = max(1, int(W))
    m = r.copy(); vao = 1
    while vao * 2 <= W:
        m = np.minimum(m, np.concatenate([m[vao:], np.ones(vao)]))
        vao *= 2
    sh = W - vao
    if sh > 0:
        m = np.minimum(m, np.concatenate([m[sh:], np.ones(sh)]))
    return m


def min_tras(r, W):
    return min_frente(r[::-1], W)[::-1]


def media_tras(r, W):
    """média de r[n-W+1 .. n] (antes do início = 1)."""
    c = np.cumsum(np.concatenate([np.ones(W), r]))
    return (c[W:] - c[:-W]) / W


# ---------- reverb (Freeverb simplificado, estéreo) ----------
def _comb(x, D, fb, damp):
    c = (1 - damp) * damp ** np.arange(4)
    c /= c.sum()
    P = D + 3
    w = np.concatenate([np.zeros(P), x])
    for s in range(P, len(w), D):
        e = min(s + D, len(w))
        w[s:e] += fb * (c[0] * w[s - D:e - D] + c[1] * w[s - D - 1:e - D - 1]
                        + c[2] * w[s - D - 2:e - D - 2] + c[3] * w[s - D - 3:e - D - 3])
    return w[3:3 + len(x)]          # saída atrasada de D amostras (como no Freeverb)


def _allpass(x, D, g=0.5):
    v = np.concatenate([np.zeros(D), x])
    for s in range(D, len(v), D):
        e = min(s + D, len(v))
        v[s:e] += g * v[s - D:e - D]
    return v[:len(x)] - x


def reverb(st, sala=0.78, amortece=0.42, largura=0.9, predelay=0.016):
    """Freeverb: 8 combs (amortecimento FIR de 4 taps) + 4 allpass por canal, spread 23."""
    combs = (1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617)
    alls = (556, 441, 341, 225)
    fb = sala * 0.28 + 0.7
    dmp = amortece * 0.4
    entrada = (st[0] + st[1]) * 0.015
    entrada = lp(hp(entrada, 260), 7000)
    entrada = atrasa(entrada, int(predelay * SR))
    saidas = []
    for spread in (0, 23):
        y = np.zeros_like(entrada)
        for D in combs:
            y += _comb(entrada, D + spread, fb, dmp)
        for D in alls:
            y = _allpass(y, D + spread)
        saidas.append(y)
    w1 = 3.0 * (largura / 2 + 0.5)
    w2 = 3.0 * ((1 - largura) / 2)
    L = saidas[0] * w1 + saidas[1] * w2
    R = saidas[1] * w1 + saidas[0] * w2
    return lp(np.stack([L, R]), 6500)


# =====================================================================
# Medição: loudness (BS.1770, filtro K + gating) e true-peak (4x)
# =====================================================================
def _kfiltros():
    fs = SR
    G, Q, fc = 3.999843853973347, 0.7071752369554196, 1681.974450955533
    K = math.tan(math.pi * fc / fs)
    Vh = 10 ** (G / 20); Vb = Vh ** 0.4996667741545416
    a0 = 1 + K / Q + K * K
    sh = ([(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0],
          [1.0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0])
    Q2, fc2 = 0.5003270373238773, 38.13547087602444
    K = math.tan(math.pi * fc2 / fs)
    a0 = 1 + K / Q2 + K * K
    hpf = ([1.0, -2.0, 1.0], [1.0, 2 * (K * K - 1) / a0, (1 - K / Q2 + K * K) / a0])
    return sh, hpf


KSH, KHP = _kfiltros()


def potencia_k(st):
    """Potência K-ponderada somada nos canais, por amostra."""
    st = np.atleast_2d(st)
    return sum(biquad(biquad(c, KSH), KHP) ** 2 for c in st)


def blocos_lufs(p, jan=0.4, hop=0.1):
    n = int(jan * SR); h = int(hop * SR)
    if len(p) < n:
        return np.array([-0.691 + 10 * np.log10(np.mean(p) + 1e-15)]), np.array([0])
    c = np.concatenate([[0.0], np.cumsum(p)])
    ini = np.arange(0, len(p) - n + 1, h)
    z = (c[ini + n] - c[ini]) / n
    return -0.691 + 10 * np.log10(z + 1e-15), ini


def lufs_integrado(st=None, p=None):
    if p is None:
        p = potencia_k(st)
    l, _ = blocos_lufs(p)
    l = l[l > -70]
    if len(l) == 0:
        return -99.0
    rel = -0.691 + 10 * np.log10(np.mean(10 ** ((l + 0.691) / 10))) - 10
    l = l[l > rel]
    return float(-0.691 + 10 * np.log10(np.mean(10 ** ((l + 0.691) / 10))))


def _filtro_tp():
    m = np.arange(-32, 33)
    h = np.sinc(m / 4.0) * np.kaiser(65, 8.0)
    fases = []
    for p in range(4):
        js = np.array([j for j in range(-9, 10) if -32 <= p + 4 * j <= 32])
        fases.append((int(js[0]), h[p + 4 * js + 32]))
    return fases


TP_FASES = _filtro_tp()


def envelope_tp(x):
    """|x| sobreamostrado 4x (máximo das 4 fases em cada amostra)."""
    N = len(x)
    pk = np.abs(x).copy()
    for jmin, c in TP_FASES:
        full = np.convolve(x, c)
        y = full[-jmin:-jmin + N]
        np.maximum(pk, np.abs(y), out=pk)
    return pk


def true_peak_db(st):
    return float(a2db(max(np.max(envelope_tp(c)) for c in np.atleast_2d(st))))


def limiter(st, teto_db=TETO_DBTP, look=0.012, hold=0.025):
    """Limiter de true-peak com look-ahead: ganho desce em `look` s antes do pico,
    segura `hold` s e volta numa rampa de `look` s. Retorna (sinal, redução máx. em dB)."""
    teto = db2a(teto_db)
    pk = np.maximum(envelope_tp(st[0]), envelope_tp(st[1]))
    r = np.minimum(1.0, teto / np.maximum(pk, 1e-9))
    if r.min() >= 1.0:
        return st, 0.0
    W = int(look * SR)
    g = min_frente(min_tras(r, int(hold * SR) + 12), W + 12)
    g = media_tras(g, W)
    g = np.minimum(g, 1.0)
    return st * g, float(-a2db(g.min()))


# =====================================================================
# Harmonia
# =====================================================================
TOM = 62                                  # Ré (D4 = 62)
PENTA = [74, 76, 78, 81, 83, 86, 88, 90]   # D5 E5 F#5 A5 B5 D6 E6 F#6 (pentatônica de Ré)

# (baixo, voicing do piano elétrico) — tudo diatônico em Ré maior
ACORDES = {
    'D':    (38, [54, 57, 61, 64]),       # Dmaj9 (F# A C# E)
    'Bm':   (35, [57, 61, 62, 66]),       # Bm9   (A C# D F#)
    'G':    (43, [54, 57, 59, 62]),       # Gmaj9 (F# A B D)
    'Asus': (45, [55, 59, 62, 66]),       # A13sus4 (G B D F#)
    'A':    (45, [55, 59, 61, 66]),       # A13   (G B C# F#)
    'F#m':  (42, [52, 57, 59, 61]),       # F#m7(11)
    'Em':   (40, [55, 59, 62, 66]),       # Em9
    'D/F#': (42, [54, 57, 61, 64]),       # Dmaj9/F#
    'G/D':  (38, [54, 57, 59, 62]),       # Gmaj9 sobre pedal de Ré (cadência plagal)
}
PROG1 = ['D', 'Bm', 'G', 'Asus'] * 2
PROG2 = ['G', 'A', 'F#m', 'Bm', 'Em', 'Asus', 'D/F#', 'Asus']


# =====================================================================
# Efeitos
# =====================================================================
class Efeitos:
    def __init__(self, rng):
        self.rng = rng
        self.n_pop = 0
        self.t_pop = -9.0
        self.grau_pop = 0
        self.n_passo = 0

    def u(self, a, b):
        return float(self.rng.uniform(a, b))

    def ruido(self, n):
        return self.rng.standard_normal(n)

    def det(self, cents=4.0):
        return 2 ** (self.u(-cents, cents) / 1200)

    # ---- sininho afinado (sucesso / final): FM harmônica (razão 2) + parcial 4 ----
    def sino(self, f, dur=1.0, queda=0.55, brilho=1.0):
        n = int(dur * SR)
        t = np.arange(n) / SR
        f = f * self.det(3)
        idx = brilho * 1.3 * np.exp(-t / 0.06) + 0.15
        x = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * 2 * f * t))
        x += 0.18 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t / 0.07)
        x += 0.10 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t / 0.18)
        x *= env(n, 0.0025, queda)
        ataque = lp(self.ruido(n), 6000) * env(n, 0.0003, 0.002) * 0.15
        return x + ataque

    # ---- marimba/kalimba macia (passo, recebe) ----
    def mallet(self, f, dur=0.8, queda=0.32):
        n = int(dur * SR)
        t = np.arange(n) / SR
        f = f * self.det(3)
        x = np.sin(2 * np.pi * f * t) * env(n, 0.002, queda)
        x += 0.22 * np.sin(2 * np.pi * 4 * f * t) * env(n, 0.001, 0.035)
        x += 0.07 * np.sin(2 * np.pi * 3 * f * t) * env(n, 0.001, 0.06)
        x += lp(self.ruido(n), 1500) * env(n, 0.0004, 0.004) * 0.12
        return x

    # ---------------------------------------------------------------
    def clique(self):
        n = int(0.07 * SR)
        fb = self.u(1450, 1750)
        tick = pico1(bp(self.ruido(n), self.u(3600, 4800), 1.3)) * env(n, 0.0003, 0.0016)
        traj = fb * (1 + 0.25 * np.exp(-np.arange(n) / SR / 0.003))
        corpo = osc(traj, n) * env(n, 0.0005, 0.0055) * 0.32
        baque = osc(np.linspace(240, 140, n), n) * env(n, 0.001, 0.011) * 0.22
        x = pico1(tick + corpo + baque)
        return pan(x, self.u(0.04, 0.16)), self.u(-11.5, -10.0), 0.05

    def tecla(self, pos=0):
        """pos = posição dentro da rajada de digitação (para o efeito ir cansando menos)."""
        n = int(0.05 * SR)
        espaco = self.rng.random() < 0.12
        tick = pico1(bp(self.ruido(n), self.u(4200, 6500), 1.6)) * env(n, 0.0002, 0.0009)
        fc = self.u(800, 1100) if espaco else self.u(1300, 2300)
        clack = pico1(bp(self.ruido(n), fc, 2.4)) * env(n, 0.0004, 0.006 if espaco else 0.0045) * self.u(0.35, 0.7)
        f0 = self.u(190, 230) if espaco else self.u(300, 430)
        thock = osc(np.linspace(f0 * 1.15, f0, n), n) * env(n, 0.0008, 0.012 if espaco else 0.007) * (0.45 if espaco else 0.2)
        x = lp(pico1(tick * self.u(0.5, 0.9) + clack + thock), 9000)
        g = -21.5 + (1.5 if espaco else 0.0) - 0.35 * min(pos, 12) + self.u(-2.5, 1.0)
        return pan(x, self.u(-0.28, 0.12)), g, 0.03

    def pop(self, t):
        # pops próximos sobem pela pentatônica (sensação de "montando"); separados recomeçam
        if t - self.t_pop > 1.2:
            self.grau_pop = int(self.rng.integers(0, 3))
        else:
            self.grau_pop = min(self.grau_pop + 1, 6) if self.rng.random() < 0.85 else max(self.grau_pop - 1, 0)
        self.t_pop = t
        self.n_pop += 1
        f = hz(PENTA[self.grau_pop] - 12)            # D4..E5 → som redondo, não estridente
        n = int(0.16 * SR)
        tt = np.arange(n) / SR
        traj = f * (0.6 + 0.4 * (1 - np.exp(-tt / 0.010)))
        x = osc(traj, n) + 0.14 * osc(traj * 2, n)
        x *= env(n, 0.0018, 0.045)
        x += pico1(bp(self.ruido(n), 2600, 2.0)) * env(n, 0.0002, 0.0012) * 0.12
        p = 0.14 if self.n_pop % 2 else -0.14
        return pan(lp(x, 5000), p + self.u(-0.05, 0.05)), self.u(-17.4, -16.2), 0.12

    def cola(self):
        n = int(0.2 * SR)
        sw = pico1(bp(self.ruido(n), self.u(2200, 3000), 0.9)) * env(n, 0.010, 0.035) * 0.45
        tuck = osc(np.linspace(190, 120, n), n) * env(n, 0.001, 0.018) * 0.4
        blip = np.zeros(n)
        o = int(0.035 * SR)
        m = n - o
        f = hz(81) * self.det(4)                     # A5
        tt = np.arange(m) / SR
        blip[o:] = osc(f * (0.75 + 0.25 * (1 - np.exp(-tt / 0.008))), m) * env(m, 0.002, 0.04) * 0.5
        x = pico1(sw + tuck + blip)
        return pan(x, self.u(-0.05, 0.08)), self.u(-18.0, -17.0), 0.1

    def passo(self):
        # cada passo novo sobe um grau da pentatônica: sensação de progresso
        k = self.n_passo
        self.n_passo += 1
        m = PENTA[min(k, len(PENTA) - 1)] - 12      # D4, E4, F#4, A4, B4, D5...
        x = self.mallet(hz(m + 12), 0.9, 0.30) + 0.55 * self.mallet(hz(m), 0.9, 0.42)
        n = len(x)
        ar = pico1(bp(self.ruido(n), 1800, 0.7)) * env(n, 0.05, 0.06) * 0.08
        x = pico1(x + ar)
        return pan(x, 0.1 if k % 2 else -0.1), -19.3, 0.25

    def sucesso(self):
        gap = int(self.u(0.075, 0.09) * SR)
        a = self.sino(hz(81), 1.0, 0.45) * self.u(0.8, 0.9)        # A5
        b = self.sino(hz(86), 1.3, 0.6)                             # D6 (tônica)
        c = self.sino(hz(98), 1.0, 0.3, 0.6) * 0.18                 # D7 brilho
        n = gap + len(b)
        out = np.zeros((2, n))
        soma(out, 0, pan(a, -0.15))
        soma(out, gap, pan(b, 0.15))
        soma(out, gap + int(0.01 * SR), pan(c, 0.3))
        return out / np.max(np.abs(out)), self.u(-19.0, -18.0), 0.3

    def toggle(self):
        n = int(0.09 * SR)
        o = int(self.u(0.024, 0.032) * SR)
        t1 = pico1(bp(self.ruido(n), 2700, 1.5)) * env(n, 0.0003, 0.0018)
        t2 = np.zeros(n)
        t2[o:] = (pico1(bp(self.ruido(n - o), 4300, 1.5)) * env(n - o, 0.0003, 0.0015)
                  + osc(hz(93), n - o) * env(n - o, 0.001, 0.022) * 0.35)  # A6
        x = pico1(t1 * 0.75 + t2)
        return pan(x, 0.08), self.u(-15.5, -14.5), 0.06

    def _varredura(self, n, traj_f, q=1.4, bandas=9, lo=180.0, hi=6000.0):
        """Ruído passado por um banco de passa-faixas fixos; o peso de cada banda segue
        uma gaussiana em log-frequência centrada em traj_f(t) → filtro "andando"."""
        r = self.ruido(n)
        cs = np.geomspace(lo, hi, bandas)
        lf = np.log2(np.maximum(traj_f, 20))
        out = np.zeros(n)
        for c in cs:
            w = np.exp(-((lf - np.log2(c)) ** 2) / (2 * 0.55 ** 2))
            out += bp(r, c, q) * w
        return out

    def whoosh(self):
        dur = 0.72
        n = int(dur * SR)
        t = np.arange(n) / n
        tp = self.u(0.5, 0.58)          # pico relativo (~0,38 s)
        fc = np.where(t < tp, 350 * (2600 / 350) ** (t / tp), 2600 * (900 / 2600) ** ((t - tp) / (1 - tp)))
        x = self._varredura(n, fc)
        a = np.where(t < tp, (t / tp) ** 2.2, np.exp(-((t - tp) / (1 - tp)) * 3.2))
        a *= np.clip((1 - t) / 0.05, 0, 1)
        x = pico1(x * a)
        corpo = osc(np.linspace(110, 55, n), n) * a * 0.18
        ar = pico1(hp(self.ruido(n), 6000)) * np.exp(-((t - tp) / 0.06) ** 2) * 0.12
        x = pico1(x + corpo + ar)
        # passa da esquerda para a direita (movimento de troca de cena)
        p = np.clip((t - tp) * 1.6, -0.45, 0.45)
        th = (p + 1) * np.pi / 4
        st = np.stack([x * np.cos(th), x * np.sin(th)]) * math.sqrt(2)
        return st, self.u(-19.0, -18.0), 0.15

    def abre(self):
        n = int(0.34 * SR)
        t = np.arange(n) / n
        fc = 400 * (2200 / 400) ** np.minimum(t / 0.55, 1)
        x = self._varredura(n, fc, q=1.2, bandas=7, lo=250, hi=4000)
        a = np.where(t < 0.55, (t / 0.55) ** 1.6, np.exp(-(t - 0.55) / 0.12))
        x = pico1(x * a) * 0.7
        o = int(0.12 * SR)
        m = n - o
        bloom = np.zeros(n)
        bloom[o:] = (osc(hz(74), m) + 0.4 * osc(hz(81), m)) * env(m, 0.02, 0.09)   # D5 + A5
        x = pico1(x + 0.35 * bloom)
        return pan(x, 0.0), -17.5, 0.2

    def envia(self):
        n = int(0.24 * SR)
        tt = np.arange(n) / SR
        f = hz(69) * 2 ** (np.minimum(tt / 0.085, 1) ** 0.6)        # A4 → A5
        tom = (osc(f, n) + 0.1 * osc(2 * f, n)) * env(n, 0.004, 0.06)
        fc = 600 * (3200 / 600) ** np.minimum(tt / 0.12, 1)
        sw = pico1(self._varredura(n, fc, q=1.3, bandas=6, lo=500, hi=4000)) * env(n, 0.03, 0.05) * 0.3
        x = pico1(tom + sw)
        p = np.minimum(tt / 0.15, 1) * 0.35
        th = (p + 1) * np.pi / 4
        st = np.stack([x * np.cos(th), x * np.sin(th)]) * math.sqrt(2)
        return st, -19.5, 0.15

    def recebe(self):
        gap = int(0.11 * SR)
        a = self.mallet(hz(86), 0.6, 0.18)       # D6
        b = self.mallet(hz(81), 0.8, 0.28)       # A5
        out = np.zeros(gap + len(b))
        out[:len(a)] += a * 0.85
        out[gap:] += b
        return pan(pico1(out), -0.22), -18.5, 0.2

    def final(self):
        notas = [74, 78, 81, 86, 88]             # D5 F#5 A5 D6 E6 (add9)
        n = int(2.6 * SR)
        out = np.zeros((2, n))
        for i, m in enumerate(notas):
            x = self.sino(hz(m), 2.2, 1.0 if i < 4 else 0.7, 0.8) * (1.0 if i < 4 else 0.45)
            soma(out, int(i * 0.07 * SR), pan(x, -0.3 + 0.15 * i))
        bl = (osc(hz(62), n) + 0.5 * osc(hz(69), n)) * env(n, 0.12, 0.9) * 0.25    # "bloom" D4+A4
        out += np.stack([bl, bl])
        return out / np.max(np.abs(out)), -16.5, 0.35


# perfil do ducking da música por tipo: (profundidade dB, ataque s, sustentação s, soltura s)
DUCK = {
    'clique': (1.2, 0.006, 0.03, 0.18), 'tecla': (0.8, 0.01, 0.06, 0.3), 'cola': (1.5, 0.008, 0.08, 0.2),
    'pop': (1.0, 0.006, 0.05, 0.18), 'passo': (2.0, 0.02, 0.25, 0.4), 'sucesso': (3.5, 0.02, 0.45, 0.6),
    'toggle': (1.5, 0.006, 0.05, 0.2), 'abre': (2.0, 0.03, 0.2, 0.3), 'whoosh': (5.0, 0.12, 0.45, 0.45),
    'envia': (2.0, 0.01, 0.12, 0.3), 'recebe': (2.5, 0.01, 0.3, 0.45), 'final': (1.5, 0.02, 0.6, 0.8),
}


def curva_ducking(eventos, N):
    d = np.zeros(N)
    for e in eventos:
        if e['tipo'] not in DUCK:
            continue
        prof, at, hold, rel = DUCK[e['tipo']]
        t0 = e['t'] - at
        i0 = max(0, int(t0 * SR))
        n = int((at + hold + rel) * SR)
        if i0 >= N:
            continue
        tt = t0 + np.arange(n) / SR - e['t']    # 0 = instante do evento
        forma = np.where(tt < 0, 0.5 - 0.5 * np.cos(np.pi * (tt + at) / at),
                         np.where(tt < hold, 1.0, 0.5 + 0.5 * np.cos(np.pi * np.minimum((tt - hold) / rel, 1))))
        forma = forma[: N - i0] * prof
        d[i0:i0 + len(forma)] = np.maximum(d[i0:i0 + len(forma)], forma)
    return db2a(-d)


# =====================================================================
# Música
# =====================================================================
def escolhe_grade(t_final):
    """BPM (88–102) e início da música (1,6–2,9 s) para o evento final cair num tempo forte."""
    if t_final is None:
        return 94.0, 2.0, None
    melhor = None
    for K in range(4, 80):
        lo = max((t_final - 2.9) / K, 240 / 102)
        hi = min((t_final - 1.6) / K, 240 / 88)
        if lo > hi:
            continue
        compasso = min(max(240 / 94, lo), hi)
        bpm = 240 / compasso
        nota = abs(bpm - 94) + (0 if K % 8 == 0 else 1.5 if K % 4 == 0 else 4)
        if melhor is None or nota < melhor[0]:
            melhor = (nota, bpm, t_final - K * compasso, K)
    if melhor is None:
        return 94.0, 2.0, None
    return melhor[1], melhor[2], melhor[3]


class Musica:
    def __init__(self, dur, t_final, rng):
        self.dur = dur
        self.rng = rng
        self.bpm, self.t0, self.K = escolhe_grade(t_final)
        self.bt = 60.0 / self.bpm
        self.bar = 4 * self.bt
        self.N = int((dur + 0.5) * SR)
        self.stems = {k: np.zeros((2, self.N)) for k in ('ep', 'baixo', 'pad', 'pluck', 'kick', 'shaker', 'hat', 'rim')}
        self.kicks = []

    def u(self, a, b):
        return float(self.rng.uniform(a, b))

    def tempo(self, compasso, batida):
        return self.t0 + compasso * self.bar + batida * self.bt

    # ---------------- instrumentos ----------------
    def ep_nota(self, m, dur, vel):
        """Piano elétrico FM (tipo Rhodes): moduladora 1:1 com índice que cai + 'tine' 14:1."""
        f = hz(m) * 2 ** (self.u(-3, 3) / 1200)
        n = int((dur + 0.35) * SR)
        t = np.arange(n) / SR
        I = vel * (1.6 * np.exp(-t / 0.35) + 0.25)
        x = np.sin(2 * np.pi * f * t + I * np.sin(2 * np.pi * f * t))
        tine = np.sin(2 * np.pi * min(14 * f, 9000) * t) * np.exp(-t / 0.012) * 0.18 * vel
        tau = float(np.clip(2.2 * math.sqrt(220 / f), 0.8, 3.0))
        a = env(n, 0.003, tau) * (0.65 + 0.35 * np.exp(-t / 0.25))
        rel = np.clip((dur + 0.35 - t) / 0.35, 0, 1) ** 2
        return (x + tine) * a * rel * vel

    def ep_acorde(self, ini, notas, dur, vel, rola=0.018):
        for i, m in enumerate(notas):
            t = ini + i * rola * self.u(0.6, 1.4) + self.u(-0.004, 0.004)
            v = vel * self.u(0.85, 1.05) * (0.9 if i == 0 else 1.0)
            soma(self.stems['ep'], int(t * SR), pan(self.ep_nota(m, dur, v), -0.25 + 0.5 * i / max(1, len(notas) - 1)))

    def baixo_nota(self, ini, m, dur, vel=1.0):
        f = hz(m)
        n = int((dur + 0.12) * SR)
        t = np.arange(n) / SR
        x = np.sin(2 * np.pi * f * t) + 0.45 * np.sin(4 * np.pi * f * t) + 0.18 * np.sin(6 * np.pi * f * t) + 0.06 * np.sin(8 * np.pi * f * t)
        a = env(n, 0.008, 1.6) * np.clip((dur + 0.12 - t) / 0.1, 0, 1)
        x = np.tanh(1.4 * x * a) * vel
        soma(self.stems['baixo'], int(ini * SR), x)

    _tab = None

    def pad_acorde(self, ini, notas, dur):
        if Musica._tab is None:
            ph = np.arange(4096) / 4096
            Musica._tab = sum(np.sin(2 * np.pi * k * ph) / k for k in range(1, 15))
        tab = Musica._tab
        n = int((dur + 0.9) * SR)
        t = np.arange(n) / SR
        a = np.clip(t / 0.5, 0, 1) ** 1.5 * np.clip((dur + 0.9 - t) / 0.9, 0, 1) ** 1.5
        out = np.zeros((2, n))
        for m in notas:
            for c, cents in ((0, -7), (0, 4), (1, 7), (1, -4)):
                f = hz(m + 12) * 2 ** (cents / 1200)
                idx = (self.rng.random() * 4096 + f * t * 4096) % 4096
                i0 = idx.astype(int)
                fr = idx - i0
                out[c] += (tab[i0] * (1 - fr) + tab[(i0 + 1) % 4096] * fr) * a
        soma(self.stems['pad'], int(ini * SR), out)

    def pluck_nota(self, ini, m, vel=1.0, p=0.0):
        f = hz(m) * 2 ** (self.u(-3, 3) / 1200)
        n = int(1.0 * SR)
        t = np.arange(n) / SR
        x = (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t) * np.exp(-t / 0.08)
             + 0.08 * np.sin(6 * np.pi * f * t) * np.exp(-t / 0.04))
        x *= env(n, 0.002, 0.28) * vel
        soma(self.stems['pluck'], int(ini * SR), pan(x, p))

    def kick(self, ini, vel=1.0):
        n = int(0.4 * SR)
        t = np.arange(n) / SR
        f = 48 + 70 * np.exp(-t / 0.03)
        x = osc(f, n) * env(n, 0.002, 0.16) + lp(self.rng.standard_normal(n), 1200) * env(n, 0.0005, 0.004) * 0.15
        soma(self.stems['kick'], int(ini * SR), x * vel)
        self.kicks.append(ini)

    def shaker(self, ini, vel):
        n = int(0.09 * SR)
        x = hp(self.rng.standard_normal(n), 5200) * env(n, self.u(0.004, 0.008), 0.022) * vel
        soma(self.stems['shaker'], int(ini * SR), pan(x, 0.32))

    def hat(self, ini, vel):
        n = int(0.08 * SR)
        x = hp(self.rng.standard_normal(n), 7500, 0.9) * env(n, 0.0008, 0.018) * vel
        soma(self.stems['hat'], int(ini * SR), pan(x, -0.28))

    def rim(self, ini, vel):
        n = int(0.15 * SR)
        x = bp(self.rng.standard_normal(n), 2200, 1.2) * env(n, 0.001, 0.035) * 0.7
        x += osc(hz(64) * 2, n) * env(n, 0.001, 0.02) * 0.4        # corpo afinado (E5)
        soma(self.stems['rim'], int(ini * SR), pan(x * vel, -0.08))

    # ---------------- arranjo ----------------
    def gerar(self):
        rng = self.rng
        K = self.K
        n_comp = int((self.dur - self.t0) / self.bar) + 2
        fim_musica = K if K is not None else n_comp
        # acordes por compasso
        cifras = []
        for b in range(fim_musica):
            sec = b // 8
            prog = PROG2 if sec % 3 == 2 else PROG1
            cifras.append(prog[b % 8])
        if K is not None and K >= 3:
            cifras[K - 2] = 'G'          # IV – V – I na chegada do evento final
            cifras[K - 1] = 'Asus'

        # introdução: pad crescendo na tônica antes da entrada
        intro_ini = 0.25
        self.pad_acorde(intro_ini, [50, 57, 61, 64], max(0.5, self.t0 - intro_ini + 0.4))

        melodia_prev = 78
        semente_mel = [int(rng.integers(0, 1000)) for _ in range(20)]
        for b, cif in enumerate(cifras):
            ini = self.tempo(b, 0)
            if ini > self.dur:
                break
            baixo, voz = ACORDES[cif]
            sec = b // 8
            pos = b % 8
            ultimo = (K is not None and b == K - 1)
            fim_sec = pos == 7
            # tipo de seção: 0 = entrada; depois alterna 1 (groove), 2 (respiro + melodia), 3 (cheia)
            tipo = 0 if sec == 0 else 1 + (sec - 1) % 3

            # --- piano elétrico ---
            if ultimo:
                self.ep_acorde(ini, voz, 2 * self.bt - 0.05, 0.75)
                self.ep_acorde(self.tempo(b, 2), ACORDES['A'][1], 2 * self.bt, 0.7)
            elif tipo == 0:
                self.ep_acorde(ini, voz, 4 * self.bt - 0.05, 0.8)
                if pos % 2 == 1:
                    self.ep_acorde(self.tempo(b, 2.5), voz[1:], 1.4 * self.bt, 0.5)
            elif tipo == 2:
                # arpejo quebrado em colcheias (variação de textura)
                ordem = [0, 2, 1, 3, 2, 1, 3, 2]
                for k, j in enumerate(ordem):
                    t = self.tempo(b, k * 0.5) + (0.03 * self.bt if k % 2 else 0)  # swing leve
                    soma(self.stems['ep'], int(t * SR),
                         pan(self.ep_nota(voz[j], 1.2 * self.bt, 0.55 * self.u(0.85, 1.05)), -0.3 + 0.2 * j))
            else:
                self.ep_acorde(ini, voz, 1.45 * self.bt, 0.8)
                self.ep_acorde(self.tempo(b, 1.5), voz, 1.0 * self.bt, 0.6)
                if pos % 4 == 3:
                    self.ep_acorde(self.tempo(b, 3.0), voz[1:], 0.9 * self.bt, 0.45)
                else:
                    self.ep_acorde(self.tempo(b, 2.75), voz, 1.2 * self.bt, 0.55)
            if cif == 'Asus' and pos == 7 and not ultimo:
                self.ep_acorde(self.tempo(b, 3), ACORDES['A'][1], 0.9 * self.bt, 0.5)

            # --- pad (sempre, baixinho) ---
            self.pad_acorde(ini, voz, self.bar)

            # --- baixo ---
            r = baixo
            if tipo == 0 or ultimo:
                self.baixo_nota(ini, r, 3.85 * self.bt, 0.9)
            elif tipo == 2:
                self.baixo_nota(ini, r, 2.4 * self.bt, 0.9)
                self.baixo_nota(self.tempo(b, 2.5), r + 7, 0.45 * self.bt, 0.7)
                self.baixo_nota(self.tempo(b, 3), r + 12 if r < 41 else r, 0.9 * self.bt, 0.75)
            else:
                self.baixo_nota(ini, r, 1.35 * self.bt, 1.0)
                self.baixo_nota(self.tempo(b, 1.5), r, 0.9 * self.bt, 0.75)
                self.baixo_nota(self.tempo(b, 3), r + 7 if pos % 2 else r + 12, 0.85 * self.bt, 0.7)

            # --- percussão ---
            if not ultimo:
                sw = 0.08   # swing das semicolcheias
                if not (tipo == 0 and pos < 4):
                    for k in range(16):
                        if fim_sec and k >= 12:
                            v = 0.35 + 0.15 * (k - 12)          # pequeno crescendo na virada
                        else:
                            v = (0.7 if k % 4 == 2 else 0.35 if k % 2 == 0 else 0.5) * self.u(0.8, 1.15)
                        t = self.tempo(b, k * 0.25 + (sw * 0.25 if k % 2 else 0))
                        self.shaker(t + self.u(-0.004, 0.004), v)
                if tipo in (1, 3):
                    for k in range(4):
                        self.hat(self.tempo(b, k + 0.5 + 0.04), 0.8 * self.u(0.8, 1.1))
                    self.kick(ini, 1.0)
                    if not fim_sec:
                        self.kick(self.tempo(b, 1.5), 0.6)
                        if pos % 2 == 1:
                            self.kick(self.tempo(b, 2.75), 0.45)
                if tipo == 3:
                    for k in (1, 3):
                        self.rim(self.tempo(b, k) + self.u(-0.004, 0.006), self.u(0.8, 1.0))

            # --- melodia de pluck (seções 2 e 3) ---
            if tipo in (2, 3) and not ultimo:
                r2 = np.random.default_rng(semente_mel[(sec * 2 + pos // 4) % 20] + pos % 4)
                ritmos = [[0, 1.5, 2.5], [0, 0.75, 2], [0.5, 1.5, 3], [0, 2.5], [1, 1.5, 2.5, 3.5]]
                ritmo = ritmos[int(r2.integers(0, len(ritmos)))] if tipo == 2 else ritmos[3]
                tons = sorted({m for m in range(72, 92) if (m - TOM) % 12 in (0, 2, 4, 7, 9)})
                alvo_acorde = [m for m in tons if any((m - v) % 12 == 0 for v in voz)]
                for j, bt in enumerate(ritmo):
                    pool = alvo_acorde if j == 0 else tons
                    cand = sorted(pool, key=lambda m: abs(m - melodia_prev) + r2.uniform(0, 3))
                    m = cand[0] if abs(cand[0] - melodia_prev) > 0 or len(cand) == 1 else cand[1]
                    m = int(np.clip(m, 74, 88))
                    melodia_prev = m
                    self.pluck_nota(self.tempo(b, bt), m, 0.8 * r2.uniform(0.8, 1.05), -0.2 if j % 2 else 0.2)

        # --- resolução no evento final (tônica) + coda plagal ---
        if K is not None:
            tf = self.tempo(K, 0)
            sobra = self.dur - tf
            vozD = [54, 57, 61, 64, 69, 76]          # Dmaj9 aberto + A4/E5 no topo
            self.ep_acorde(tf, vozD, min(sobra, 2 * self.bar), 0.85, rola=0.03)
            self.baixo_nota(tf, 38, min(sobra, 2 * self.bar), 0.95)
            self.kick(tf, 0.7)
            if self.tempo(K + 2, 0) <= self.dur - 2.3:
                self.pad_acorde(tf, [54, 57, 61, 64], self.bar)
                self.ep_acorde(self.tempo(K + 1, 0), ACORDES['G/D'][1], self.bar, 0.55, rola=0.04)
                self.pad_acorde(self.tempo(K + 1, 0), ACORDES['G/D'][1], self.bar)
                self.ep_acorde(self.tempo(K + 2, 0), [54, 57, 61, 64, 74], max(0.5, self.dur - self.tempo(K + 2, 0)), 0.5, rola=0.05)
                self.pad_acorde(self.tempo(K + 2, 0), [50, 57, 61, 64], max(0.5, self.dur - self.tempo(K + 2, 0)))
                self.baixo_nota(self.tempo(K + 2, 0) - 0.01, 38, max(0.5, self.dur - self.tempo(K + 2, 0)), 0.7)
            else:
                # pouco tempo: só a tônica soando, com um arpejo agudo bem leve no compasso seguinte
                self.pad_acorde(tf, [54, 57, 61, 64], max(0.5, sobra))
                t1 = self.tempo(K + 1, 0)
                if t1 <= self.dur - 2.0:
                    for i, m in enumerate([69, 74, 76, 78]):
                        soma(self.stems['ep'], int((t1 + i * 0.5 * self.bt) * SR),
                             pan(self.ep_nota(m, 2.0, 0.35), -0.2 + 0.13 * i))

        return self.mixar()

    def mixar(self):
        s = self.stems
        # tratamento por instrumento
        s['ep'] = biquad(lp(s['ep'], 6500, 0.6), rbj('pico', 2500, 0.8, 2.0))
        t = np.arange(self.N) / SR
        trem = 0.1 * np.sin(2 * np.pi * 4.2 * t)          # trêmolo estéreo suave do Rhodes
        s['ep'] = s['ep'] * np.stack([1 + trem, 1 - trem])
        s['baixo'] = lp(hp(s['baixo'], 45, 0.6), 900)
        s['pad'] = hp(lp(lp(s['pad'], 1500, 0.5), 2200, 0.5), 180)
        s['kick'] = hp(lp(s['kick'], 900), 40)
        s['rim'] = hp(s['rim'], 300)
        s['pluck'] = lp(s['pluck'], 5000)
        # eco ping-pong (colcheia pontuada) no pluck
        d = int(0.75 * self.bt * SR)
        mono = s['pluck'].sum(0) * 0.5
        eco = np.zeros_like(s['pluck'])
        for k, g in enumerate((0.32, 0.2, 0.12, 0.07)):
            eco[k % 2] += atrasa(mono, d * (k + 1)) * g
        s['pluck'] = s['pluck'] + lp(eco, 3500)
        # pump do pad com o kick (sidechain bem leve)
        pump = np.ones(self.N)
        for k in self.kicks:
            i0 = int(k * SR); n = int(0.3 * SR)
            if i0 >= self.N:
                continue
            tt = np.arange(min(n, self.N - i0)) / SR
            pump[i0:i0 + len(tt)] = np.minimum(pump[i0:i0 + len(tt)], 1 - 0.22 * np.exp(-tt / 0.09))
        s['pad'] = s['pad'] * pump
        # níveis por medição (LUFS de cada stem nas partes em que toca), relativos ao EP
        alvo = {'ep': -22.0, 'baixo': -25.5, 'pad': -31.0, 'pluck': -27.0, 'kick': -32.0,
                'shaker': -35.5, 'hat': -37.5, 'rim': -36.0}
        mix = np.zeros((2, self.N))
        envio = np.zeros((2, self.N))
        sends = {'ep': 0.25, 'baixo': 0.0, 'pad': 0.3, 'pluck': 0.4, 'kick': 0.0, 'shaker': 0.08, 'hat': 0.06, 'rim': 0.2}
        for k, x in s.items():
            if not np.any(x):
                continue
            g = db2a(alvo[k] - lufs_integrado(x))
            mix += x * g
            envio += x * g * sends[k]
        # fade de saída nos últimos 2 s (curva cosseno) — o acorde final continua soando
        fade = np.ones(self.N)
        i0 = int((self.dur - 2.0) * SR); i1 = int(self.dur * SR)
        fade[i0:i1] = 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, i1 - i0))
        fade[i1:] = 0
        # leve inclinação do bus: menos grave embolado, mais presença (alto-falante de celular)
        mix = biquad(biquad(mix, rbj('ls', 120, 0.7, -1.5)), rbj('hs', 3500, 0.7, 2.0))
        return mix * fade, envio * fade


# =====================================================================
# Montagem
# =====================================================================
def main():
    if len(sys.argv) < 4:
        sys.exit('uso: python3 som.py eventos.json duracao saida.wav [semente]')
    eventos = json.load(open(sys.argv[1]))
    dur = float(sys.argv[2])
    semente = int(sys.argv[4]) if len(sys.argv) > 4 else 7
    rng = np.random.default_rng(semente)
    eventos = sorted((e for e in eventos if 'tipo' in e and 't' in e), key=lambda e: e['t'])
    N = int((dur + 0.5) * SR)

    # ---------- efeitos ----------
    fx = Efeitos(np.random.default_rng(semente + 1))
    sfx = np.zeros((2, N))
    sfx_envio = np.zeros((2, N))
    t_ult_tecla, run = -9.0, 0
    for e in eventos:
        tipo, t = e['tipo'], max(0.0, float(e['t']))
        if t >= dur:
            continue
        if tipo == 'tecla':
            run = run + 1 if t - t_ult_tecla < 0.3 else 0
            t_ult_tecla = t
            x, g, sd = fx.tecla(run)
        elif tipo == 'pop':
            x, g, sd = fx.pop(t)
        elif hasattr(fx, tipo) and tipo in DUCK:
            x, g, sd = getattr(fx, tipo)()
        else:
            print(f'aviso: tipo de evento desconhecido: {tipo}', file=sys.stderr)
            continue
        if tipo == 'clique' and any(o['tipo'] == 'toggle' and abs(o['t'] - t) < 0.04 for o in eventos):
            g -= 8.0                     # o toggle já tem o próprio clique: evita clique dobrado
        x = x * db2a(g)
        soma(sfx, int(t * SR), x)
        soma(sfx_envio, int(t * SR), x * sd)

    # ---------- música ----------
    t_final = next((float(e['t']) for e in eventos if e['tipo'] == 'final'), None)
    mus = Musica(dur, t_final, rng)
    musica, mus_envio = mus.gerar()
    # nível da música relativo aos efeitos: música (antes do ducking) em -24 LUFS de referência
    gm = db2a(-24.0 - lufs_integrado(musica))
    duck = curva_ducking(eventos, N)
    duck = media_tras(duck, int(0.01 * SR))          # suaviza quinas
    musica = musica * gm * duck
    mus_envio = mus_envio * gm * duck

    # ---------- reverb comum (envios) ----------
    rev = reverb(mus_envio + sfx_envio * 1.4)
    mix = musica + sfx + rev
    mix = hp(mix, 28, 0.6)

    # ---------- master: loudness -16 LUFS + limiter de true-peak ----------
    n_out = int(round(dur * SR))
    mix = mix[:, :n_out]
    musica_m, sfx_m = musica[:, :n_out], sfx[:, :n_out]
    gr_max = 0.0
    ganho_total = 1.0
    for _ in range(3):
        L = lufs_integrado(mix)
        g = db2a(ALVO_LUFS - L)
        mix = mix * g
        ganho_total *= g
        mix, gr = limiter(mix)
        gr_max = max(gr_max, gr)
    # fades de segurança de 5 ms nas pontas
    f = int(0.005 * SR)
    mix[:, :f] *= np.linspace(0, 1, f)
    mix[:, -f:] *= np.linspace(1, 0, f)
    # dither TPDF e 16 bits
    dither = (np.random.default_rng(semente + 2).random(mix.shape) - np.random.default_rng(semente + 3).random(mix.shape)) / 32768
    pcm = np.clip(np.round((mix + dither) * 32767), -32768, 32767).astype(np.int16)
    with wave.open(sys.argv[3], 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.T.tobytes())

    # ---------- medidas (stderr) ----------
    final = pcm.astype(float) / 32768
    if os.environ.get('SOM_STEMS'):          # só para análise: salva stems com o ganho do master
        np.savez_compressed(os.environ['SOM_STEMS'], musica=musica_m * ganho_total,
                            efeitos=sfx_m * ganho_total, final=final, bpm=mus.bpm, t0=mus.t0)
    L = lufs_integrado(final)
    tp = true_peak_db(final)
    Lm = lufs_integrado(musica_m * ganho_total)
    Ls = lufs_integrado(sfx_m * ganho_total)
    print(f'bpm={mus.bpm:.1f} inicio={mus.t0:.2f}s final_no_compasso={mus.K} | '
          f'LUFS={L:.1f} TP={tp:.2f}dBTP limiter_max={gr_max:.1f}dB | '
          f'musica={Lm:.1f}LUFS efeitos={Ls:.1f}LUFS', file=sys.stderr)


if __name__ == '__main__':
    main()
