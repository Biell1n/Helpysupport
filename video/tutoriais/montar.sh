#!/bin/bash
# bash montar.sh nome  → nome.html vira saida/nome.mp4 (com som) e saida/nome.jpg (capa)
set -e
D=$(cd "$(dirname "$0")" && pwd)
N=$1
O=$D/out/$N
node $D/gravar.cjs $D/$N.html $O
python3 $D/som.py $O/eventos.json $(cat $O/duracao.txt) $O/som.wav
mkdir -p $D/saida
ffmpeg -v error -y -framerate 30 -i $O/f/%05d.jpg -i $O/som.wav -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p -c:a aac -b:a 128k -shortest -movflags +faststart $D/saida/$N.mp4
ffmpeg -v error -y -ss 5.5 -i $D/saida/$N.mp4 -frames:v 1 -q:v 3 $D/saida/$N.jpg
ls -la $D/saida/$N.mp4
