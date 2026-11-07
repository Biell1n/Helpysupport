# Vídeos dos tutoriais de canais

Cada `*.html` é um vídeo: cenas com câmera, cursor e legendas. O motor fica em `motor.js` e `motor.css`, a aparência em `base.css`, e as peças repetidas (barra do navegador, lateral do Helpy, botão de copiar) em `partes.js`. O roteiro de cada cena está explicado no topo de `motor.js`.

| Arquivo | Vídeo | Onde aparece no app |
|---|---|---|
| whatsapp-1.html | Conectar o WhatsApp (parte 1) | Canais → WhatsApp → Conectar |
| whatsapp-2.html | Depois de conectar (parte 2) | WhatsApp conectado → Ver dados para colar na Meta |
| instagram-1.html | Conectar o Instagram (parte 1) | Canais → Instagram → Conectar |
| instagram-2.html | Depois de conectar (parte 2) | Instagram conectado → Ver dados para colar na Meta |
| discord.html | Conectar o Discord | Canais → Discord → Conectar |

O som (efeitos e música em ré maior, −16 LUFS) é sintetizado por `som.py` a partir dos eventos que a página exporta; não usa nenhum arquivo de terceiros.

Gerar (precisa de Node com Playwright, Python com numpy e ffmpeg):

    bash video/tutoriais/montar.sh whatsapp-1    # um vídeo
    bash video/tutoriais/todos.sh                # todos

Sai em `video/tutoriais/saida/<nome>.mp4` e `.jpg`; copie para `public/videos/conectar-<nome>.mp4` e `.jpg`.
Para conferir quadros soltos sem gravar tudo: `node previa.cjs $PWD/whatsapp-1.html pasta 3.5 10 20`.

Regras que os revisores pediram e que valem para cenas novas:
- legenda curta (até ~16 palavras) e cena com pelo menos 2 s + palavras ÷ 2,5;
- primeiro clique a partir de 1,6 s; a câmera nunca anda durante um clique;
- copiar de um lado e colar no Helpy logo em seguida (painel `.mini`), nunca "copie tudo e cole no fim";
- dois estados no mesmo lugar ficam dentro de `.troca` (nada pula).
