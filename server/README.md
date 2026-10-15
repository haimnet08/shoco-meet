# Server side of Shoco Meet (meet.shocoweb.com)

Mirror of what runs on the Shoco VPS (157.173.122.245, HestiaCP, nginx only). Installed 15.10.2026.

| Piece | Live path | Role |
|---|---|---|
| `server.js`, `package.json` | `/opt/shoco-meet/peer-server/` | PeerJS broker (`/peerjs`) + `/turn` (12h TURN REST credentials) + `/healthz`, node on 127.0.0.1:9000 |
| `shoco-meet-peer.service` | `/etc/systemd/system/` | systemd unit, user nobody, reads `/etc/shoco-meet/env` (`PORT`, `TURN_HOST`, `TURN_SECRET`) |
| `hestia-nginx-template/meet.*` | `/usr/local/hestia/data/templates/web/nginx/php-fpm/` | Hestia web template: static `web/` + proxies for `/peerjs`, `/turn`, `/healthz`, HSTS, noindex |
| `turnserver.conf` | `/etc/turnserver.conf` | coturn: 3478 (udp/tcp) + 5349 (TLS), relay ports 49160-49400, `use-auth-secret` (same secret as the env file), private ranges denied |
| `bin/deploy.sh` | `/opt/shoco-meet/bin/` | `git pull` of this repo + rsync `web/` into `/home/admin/web/meet.shocoweb.com/public_html` |
| `bin/finish-ssl.sh` | `/opt/shoco-meet/bin/` | one-shot after DNS: Let's Encrypt via Hestia, ssl-force, HSTS, cert copy to coturn |
| `bin/sync-turn-cert.sh` + `.cron` | `/opt/shoco-meet/bin/`, `/etc/cron.d/` | daily: copy a renewed LE cert to `/etc/coturn/certs` and restart coturn only when it changed |

Firewall (Hestia rules "SHOCO-MEET-TURN"): TCP 3478,5349; UDP 3478,5349; UDP 49160:49400.

Deploy a web change: push to `main`, then on the VPS `/opt/shoco-meet/bin/deploy.sh`.
Checks: `curl https://meet.shocoweb.com/healthz`, `turnutils_uclient -y -u shoco -W <secret> -p 3478 meet.shocoweb.com` (TLS 5349 verify with `openssl s_client -tls1_2`, turnutils only speaks TLS 1.0).
