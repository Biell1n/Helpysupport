#!/bin/bash
# ============================================================
# Helpy · instala o servidor do Discord numa máquina nova (Oracle Cloud,
# Ubuntu). Cole este script inteiro em "Script cloud-init" ao criar a
# instância (Mostrar opções avançadas → Gerenciamento) ou rode como root:
#   sudo bash instalar-oracle.sh
#
# Troque COLE_A_CHAVE_AQUI pela chave que o Helpy te passou.
#
# O que ele faz: instala o Node 22, baixa o programa do repositório,
# cria o serviço "helpy-gateway" (liga sozinho, volta se cair) e, toda
# madrugada, reinicia para pegar a versão mais nova do programa.
# A máquina só faz conexões de saída: não precisa abrir porta nenhuma.
# ============================================================
set -euo pipefail

HELPY_GATEWAY_KEY="COLE_A_CHAVE_AQUI"
HELPY_URL="https://cdscurcwcyzeagincjdv.supabase.co/functions/v1/public-chat"
PROGRAMA="https://raw.githubusercontent.com/Biell1n/Helpysupport/main/gateway/discord-gateway.mjs"

# ---- Node 22 (binário oficial, conferido pelo SHA-256) ----
case "$(uname -m)" in
  x86_64) ARQ=x64 ;;
  aarch64) ARQ=arm64 ;;
  *) echo "Processador não suportado: $(uname -m)"; exit 1 ;;
esac
cd /tmp
SOMAS=$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt)
ARQUIVO=$(echo "$SOMAS" | awk -v a="linux-${ARQ}.tar.gz" '$2 ~ a"$" {print $2}' | head -n1)
curl -fsSLO "https://nodejs.org/dist/latest-v22.x/${ARQUIVO}"
echo "$SOMAS" | grep " ${ARQUIVO}\$" | sha256sum -c -
rm -rf /opt/node && mkdir -p /opt/node
tar -xzf "$ARQUIVO" -C /opt/node --strip-components=1
ln -sf /opt/node/bin/node /usr/local/bin/node
rm -f "$ARQUIVO"

# ---- usuário sem privilégios e o programa ----
id helpy >/dev/null 2>&1 || useradd --system --home /opt/helpy --shell /usr/sbin/nologin helpy
mkdir -p /opt/helpy
curl -fsSL "$PROGRAMA" -o /opt/helpy/discord-gateway.mjs
chown -R helpy:helpy /opt/helpy

umask 077
cat > /etc/helpy-gateway.env <<EOF
HELPY_URL=${HELPY_URL}
HELPY_GATEWAY_KEY=${HELPY_GATEWAY_KEY}
EOF
chmod 600 /etc/helpy-gateway.env
umask 022

# ---- serviço: liga com a máquina e volta sozinho se cair ----
cat > /etc/systemd/system/helpy-gateway.service <<EOF
[Unit]
Description=Helpy - servidor do Discord
After=network-online.target
Wants=network-online.target

[Service]
EnvironmentFile=/etc/helpy-gateway.env
# pega a versão mais nova do programa (se o GitHub falhar, usa a que já tem)
ExecStartPre=-/bin/sh -c 'curl -fsSL ${PROGRAMA} -o /opt/helpy/novo.mjs && /usr/local/bin/node --check /opt/helpy/novo.mjs && mv /opt/helpy/novo.mjs /opt/helpy/discord-gateway.mjs'
ExecStart=/usr/local/bin/node /opt/helpy/discord-gateway.mjs
User=helpy
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/helpy
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

# ---- atualização de madrugada (04:00 UTC) ----
cat > /etc/systemd/system/helpy-gateway-atualizar.service <<EOF
[Unit]
Description=Helpy - reinicia o servidor do Discord para atualizar

[Service]
Type=oneshot
ExecStart=/bin/systemctl restart helpy-gateway.service
EOF
cat > /etc/systemd/system/helpy-gateway-atualizar.timer <<EOF
[Unit]
Description=Helpy - atualização diária do servidor do Discord

[Timer]
OnCalendar=*-*-* 04:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now helpy-gateway.service helpy-gateway-atualizar.timer
echo "Pronto. Para ver o que está acontecendo: journalctl -u helpy-gateway -f"
