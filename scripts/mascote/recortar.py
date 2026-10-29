"""Tira o fundo verde das camadas do mascote e salva PNG transparente (e WebP) em public/img/mascote/.

uso: python3 scripts/mascote/recortar.py scripts/mascote/saida/camada-*.png
"""
import sys
from pathlib import Path

from PIL import Image

DESTINO = Path('public/img/mascote')
DESTINO.mkdir(parents=True, exist_ok=True)

for nome in sys.argv[1:]:
    img = Image.open(nome).convert('RGBA')
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            # quanto mais "verde puro", mais transparente; a borda some suave e sem halo verde
            verde = g - max(r, b)
            if verde > 90:
                px[x, y] = (r, g, b, 0)
            elif verde > 30:
                alfa = int(255 * (90 - verde) / 60)
                px[x, y] = (r, min(g, max(r, b)), b, alfa)
    caixa = img.getbbox()
    if caixa:
        img = img.crop(caixa)
    base = DESTINO / Path(nome).stem.replace('camada-', '')
    img.save(base.with_suffix('.png'))
    img.save(base.with_suffix('.webp'), quality=90, method=6)
    print('ok', base.with_suffix('.webp'))
