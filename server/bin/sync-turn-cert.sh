#!/bin/bash
# Copy the Let's Encrypt certificate of meet.shocoweb.com (issued/renewed by Hestia) to coturn; restart coturn only when it changed.
set -euo pipefail
SRC=/home/admin/conf/web/meet.shocoweb.com/ssl
DST=/etc/coturn/certs
[ -f "$SRC/meet.shocoweb.com.pem" ] || { echo "no cert yet at $SRC"; exit 0; }
mkdir -p "$DST"
if [ -f "$DST/fullchain.pem" ] && cmp -s "$SRC/meet.shocoweb.com.pem" "$DST/fullchain.pem" && cmp -s "$SRC/meet.shocoweb.com.key" "$DST/privkey.pem"; then exit 0; fi
install -o turnserver -g turnserver -m 0640 "$SRC/meet.shocoweb.com.pem" "$DST/fullchain.pem"
install -o turnserver -g turnserver -m 0640 "$SRC/meet.shocoweb.com.key" "$DST/privkey.pem"
systemctl restart coturn
echo "coturn cert synced: $(openssl x509 -noout -enddate -in "$DST/fullchain.pem")"
