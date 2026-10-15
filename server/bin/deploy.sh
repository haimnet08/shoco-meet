#!/bin/bash
# Deploy Shoco Meet: pull the GitHub repo and copy web/ into the Hestia docroot of meet.shocoweb.com.
set -euo pipefail
REPO=/opt/shoco-meet/repo
DOCROOT=/home/admin/web/meet.shocoweb.com/public_html
git -C "$REPO" pull -q --ff-only
rsync -a --delete --exclude '.git' "$REPO/web/" "$DOCROOT/"
chown -R admin:admin "$DOCROOT"
echo "deployed $(git -C "$REPO" rev-parse --short HEAD) -> $DOCROOT"
