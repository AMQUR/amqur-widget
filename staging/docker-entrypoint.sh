#!/bin/sh
set -e
PORT="${PORT:-80}"
sed "s/LISTEN_PORT/${PORT}/g" /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
