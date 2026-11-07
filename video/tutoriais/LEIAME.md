# Vídeos dos tutoriais de canais

Cada `*.html` é um vídeo: cenas com câmera, cursor e legendas (motor em `motor.js` e `motor.css`).
O som (cliques, teclas, transições e o fundo) é sintetizado por `som.py` a partir dos eventos que a página exporta.

Gerar um vídeo (precisa de Node com Playwright, Python com numpy e ffmpeg):

    bash video/tutoriais/montar.sh whatsapp     # ou instagram, discord

Sai em `video/tutoriais/saida/<nome>.mp4` e `.jpg`. Copie para `public/videos/conectar-<nome>.mp4` e `.jpg`.
Para conferir quadros soltos sem gravar tudo: `node previa.cjs $PWD/whatsapp.html pasta 3.5 10 20`.
