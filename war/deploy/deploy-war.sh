#!/usr/bin/env bash
set -Eeuo pipefail
umask 022

stage=$(realpath "${1:?Release directory required}")
release_id=${2:?Release identifier required}
[[ "$release_id" =~ ^[0-9]+-[0-9]+$ ]]
[[ "$stage" == "/tmp/war-release-$release_id" ]]
test "$(id -u)" = 0
test "$(uname -m)" = x86_64

target=/opt/war-game
release=$target/releases/$release_id
site=/etc/nginx/sites-available/sanguoddz.xyz
snippet=/etc/nginx/snippets/war-game.conf
unit=/etc/systemd/system/war-game.service
backup=$target/backups/$release_id
old_current=
service_changed=0
nginx_changed=0

if [[ -e "$target" && ! -f "$target/.war-game-managed" ]]; then
    printf 'Refusing to replace an unmanaged directory: %s\n' "$target"; exit 1
fi
if [[ -e "$unit" && ! -f "$target/.war-game-managed" ]]; then
    printf 'Refusing to replace an existing unmanaged service\n'; exit 1
fi
if [[ -L "$target/current" && -f "$unit" ]]; then
    old_current=$(readlink -f "$target/current")
    [[ "$old_current" == "$target/releases/"* ]]
fi
test ! -e "$release"
test ! -e "$backup"
test -f "$site"
nginx -t
cd "$stage"
sha256sum -c SHA256SUMS
main_before=$(curl -fsS --max-time 10 --resolve sanguoddz.xyz:443:127.0.0.1 https://sanguoddz.xyz/ | sha256sum | cut -d ' ' -f 1)
if [[ -z "$old_current" ]] && ss -ltnH 'sport = :5190' | grep -q .; then
    printf 'Port 5190 is already in use\n'; exit 1
fi

install -d -m 755 "$target" "$target/releases"
touch "$target/.war-game-managed"
install -d -m 700 "$target/backups" "$backup"
cp -a "$site" "$backup/site.conf"
if [[ -e "$snippet" ]]; then cp -a "$snippet" "$backup/snippet.conf"; fi
if [[ -e "$unit" ]]; then cp -a "$unit" "$backup/war-game.service"; fi
printf '%s\n' "$old_current" > "$backup/previous-release"

restore() {
    local result=$?
    if [[ "$result" == 0 ]]; then result=1; fi
    trap - ERR INT TERM
    set +e
    if [[ "$service_changed" == 1 ]]; then
        systemctl stop war-game.service
        if [[ -n "$old_current" ]]; then
            ln -sfn "$old_current" "$target/current.rollback"
            mv -Tf "$target/current.rollback" "$target/current"
        else
            rm -f "$target/current"
        fi
        if [[ -f "$backup/war-game.service" ]]; then
            cp "$backup/war-game.service" "$unit"
        else
            systemctl disable war-game.service
            rm -f "$unit"
        fi
        systemctl daemon-reload
        if [[ -n "$old_current" ]]; then systemctl start war-game.service; fi
    fi
    if [[ "$nginx_changed" == 1 ]]; then
        cp "$backup/site.conf" "$site"
        if [[ -f "$backup/snippet.conf" ]]; then cp "$backup/snippet.conf" "$snippet"; else rm -f "$snippet"; fi
        if nginx -t; then systemctl reload nginx; fi
    fi
    printf 'War deployment failed; previous configuration restored. Backup: %s\n' "$backup"
    exit "$result"
}
trap restore ERR INT TERM

install -d -m 755 "$release"
tar -xzf "$stage/war.tar.gz" -C "$release" --no-same-owner
find "$release" -type d -exec chmod 755 {} +
find "$release" -type f -exec chmod 644 {} +
chmod 755 "$release/runtime/node"
"$release/runtime/node" --version
"$release/runtime/node" --check "$release/serve.mjs"

service_changed=1
ln -s "$release" "$target/current.next"
mv -Tf "$target/current.next" "$target/current"
install -m 644 "$release/deploy/war-game.service" "$unit"
systemctl daemon-reload
systemctl enable war-game.service
systemctl restart war-game.service
healthy=0
for attempt in $(seq 1 20); do
    if curl -fsS --max-time 2 http://127.0.0.1:5190/health | python3 -c 'import json,sys; assert json.load(sys.stdin)["version"] == "battle-pvp-1"' 2>/dev/null; then healthy=1; break; fi
    sleep 1
done
test "$healthy" = 1

nginx_changed=1
install -m 644 "$release/deploy/war-game.nginx.conf" "$snippet"
python3 - "$site" <<'PY'
import pathlib,re,sys
path=pathlib.Path(sys.argv[1])
text=path.read_text()
include='    include /etc/nginx/snippets/war-game.conf;\n'
if include.strip() not in text:
    # Match the one existing HTTPS catch-all, leaving poker API, socket and SSL blocks intact.
    matches=list(re.finditer(r'^    location / \{',text,re.M))
    if len(matches)!=1 or not re.search(r'listen\s+443\s+ssl',text):
        raise SystemExit('Unexpected nginx site structure; no configuration changed')
    start=matches[0].start()
    text=text[:start]+include+text[start:]
    path.write_text(text)
PY
nginx -t
systemctl reload nginx
# Reload returns before old nginx workers have finished handing over the route.
route_ready=0
for attempt in $(seq 1 20); do
    if curl -fsS --max-time 3 --resolve sanguoddz.xyz:443:127.0.0.1 https://sanguoddz.xyz/war/health | python3 -c 'import json,sys; assert json.load(sys.stdin)["version"] == "battle-pvp-1"' 2>/dev/null; then route_ready=1; break; fi
    sleep 1
done
test "$route_ready" = 1
curl -fsS --max-time 10 --resolve sanguoddz.xyz:443:127.0.0.1 https://sanguoddz.xyz/war/ -o "$backup/war-home.html"
grep -q '<title>全面战争</title>' "$backup/war-home.html"
main_after=$(curl -fsS --max-time 10 --resolve sanguoddz.xyz:443:127.0.0.1 https://sanguoddz.xyz/ | sha256sum | cut -d ' ' -f 1)
test "$main_before" = "$main_after"
systemctl is-active war-game.service
trap - ERR INT TERM
printf 'War deployed: https://sanguoddz.xyz/war/; original main page checksum unchanged. Release: %s\n' "$release_id"
