#!/bin/sh
# Внешняя резервная копия: архив data/ (база + загрузки). Добавьте в cron хоста:
#   15 4 * * * /opt/wednello/deploy/backup.sh /opt/wednello /var/backups/wednello
set -eu
SRC=${1:-.}
DST=${2:-./backups-external}
mkdir -p "$DST"
tar -czf "$DST/wednello-$(date +%F).tar.gz" -C "$SRC" data
find "$DST" -name 'wednello-*.tar.gz' -mtime +30 -delete
