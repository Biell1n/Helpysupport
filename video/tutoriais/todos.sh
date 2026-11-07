#!/bin/bash
# grava todos os vídeos, um depois do outro
D=$(cd "$(dirname "$0")" && pwd)
for n in ${@:-whatsapp-1 whatsapp-2 instagram-1 instagram-2 discord}; do bash $D/montar.sh $n > $D/out-log-$n.txt 2>&1 || echo "FALHOU $n"; done
echo FIM
