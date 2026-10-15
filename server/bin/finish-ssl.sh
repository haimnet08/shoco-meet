#!/bin/bash
# Run once after the DNS record meet.shocoweb.com -> 157.173.122.245 exists: Let's Encrypt cert, HTTPS redirect, coturn TLS cert.
set -euo pipefail
H=/usr/local/hestia/bin
dig +short A meet.shocoweb.com @1.1.1.1 | grep -q 157.173.122.245 || { echo "DNS not live yet"; exit 1; }
$H/v-add-letsencrypt-domain admin meet.shocoweb.com
$H/v-add-web-domain-ssl-force admin meet.shocoweb.com || true
$H/v-add-web-domain-ssl-hsts admin meet.shocoweb.com || true
/opt/shoco-meet/bin/sync-turn-cert.sh
curl -s -o /dev/null -w "https://meet.shocoweb.com/ -> %{http_code}\n" https://meet.shocoweb.com/
curl -s https://meet.shocoweb.com/peerjs/peerjs/id; echo
ss -ltnp | grep -E ":5349" | head -1
