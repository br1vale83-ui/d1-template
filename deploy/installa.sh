#!/usr/bin/env bash
# Installa o aggiorna il registro presenze su Ubuntu. Da lanciare dalla cartella del repository:
#   sudo ./deploy/installa.sh
set -euo pipefail

DEST=/opt/registro-presenze
DATI=/var/lib/registro-presenze
ENV_FILE=/etc/registro-presenze.env
SORGENTE="$(cd "$(dirname "$0")/.." && pwd)"

[ "$(id -u)" -eq 0 ] || { echo "Lancia lo script con sudo"; exit 1; }

if ! command -v node >/dev/null; then
	echo "Node.js non trovato. Installa Node 22 LTS, ad esempio:"
	echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt-get install -y nodejs"
	exit 1
fi
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)' || {
	echo "Serve Node.js 22.13 o successivo (trovato $(node -v))"; exit 1; }

echo "» Compilazione"
cd "$SORGENTE"
sudo -u "${SUDO_USER:-root}" npm ci --no-audit --no-fund
sudo -u "${SUDO_USER:-root}" npm run build:server

echo "» Utente e cartelle"
id presenze >/dev/null 2>&1 || useradd --system --home "$DATI" --shell /usr/sbin/nologin presenze
install -d -o presenze -g presenze -m 750 "$DATI" "$DATI/backup"
install -d -m 755 "$DEST" "$DEST/dist" "$DEST/migrations"
install -m 644 dist/server.mjs "$DEST/dist/server.mjs"
rm -f "$DEST"/migrations/*.sql
install -m 644 migrations/*.sql "$DEST/migrations/"

[ -f "$ENV_FILE" ] || install -m 640 -g presenze deploy/registro-presenze.env "$ENV_FILE"
install -m 644 deploy/registro-presenze.service /etc/systemd/system/registro-presenze.service

echo "» Avvio del servizio"
systemctl daemon-reload
systemctl enable registro-presenze >/dev/null
systemctl restart registro-presenze
sleep 2
systemctl --no-pager --lines=5 status registro-presenze || true

PORTA=$(grep -E '^PORTA=' "$ENV_FILE" | cut -d= -f2)
echo
echo "Fatto. Apri http://$(hostname -I | awk '{print $1}'):${PORTA:-8787}/ dal browser."
echo "Log: journalctl -u registro-presenze -f"
