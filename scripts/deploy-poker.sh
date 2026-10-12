#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

stage=$(realpath "${1:?Release directory required}")
target=/poker
backup=$target/backups/$(date +%Y%m%d-%H%M%S)-$$
candidate_pid=
new_pid=
stopped=0
replaced=0

wait_stopped() {
    local pid=$1
    for attempt in $(seq 1 30); do
        if ! kill -0 "$pid" 2>/dev/null; then return 0; fi
        sleep 1
    done
    return 1
}

wait_config() {
    local port=$1 successes=0
    for attempt in $(seq 1 40); do
        if curl -fsS --max-time 2 "http://127.0.0.1:$port/api/auth/wechat/config" 2>/dev/null |
                python3 -c 'import json,sys; x=json.load(sys.stdin); assert isinstance(x["enabled"],bool); assert isinstance(x["avatarEnabled"],bool)' 2>/dev/null; then
            successes=$((successes + 1))
            if [[ "$successes" -ge 3 ]]; then return 0; fi
        else
            successes=0
        fi
        sleep 1
    done
    return 1
}

restore_old() {
    local result=$?
    trap - ERR
    set +e
    if [[ -n "$candidate_pid" ]]; then
        kill -TERM "$candidate_pid" 2>/dev/null
        if ! wait_stopped "$candidate_pid"; then
            printf 'Candidate did not stop; manual recovery required. Backup=%s\n' "$backup"
            exit "$result"
        fi
    fi
    if [[ -n "$new_pid" ]]; then
        kill -TERM "$new_pid" 2>/dev/null
        if ! wait_stopped "$new_pid"; then
            printf 'New backend did not stop; manual recovery required. Backup=%s\n' "$backup"
            exit "$result"
        fi
    fi
    if [[ "$stopped" == 1 ]]; then
        if [[ "$replaced" == 1 ]]; then
            cp "$backup/poker-0.0.1-SNAPSHOT.jar" "$target/poker-0.0.1-SNAPSHOT.jar"
            if [[ -f "$backup/frontend.tar.gz" ]]; then tar -xzf "$backup/frontend.tar.gz" -C /var/www/html; fi
        fi
        if ! kill -0 "$old_pid" 2>/dev/null; then
            cd "$target"
            nohup java -jar poker-0.0.1-SNAPSHOT.jar > "$backup/rollback.log" 2>&1 < /dev/null &
            printf 'Old backend restart requested; backup=%s\n' "$backup"
        fi
    fi
    printf 'Deployment failed; database backup retained at %s/data\n' "$backup"
    exit "$result"
}

test "$(id -u)" = 0
test -s "$target/data/poker-auth.mv.db"
old_pids=()
for pid in $(pgrep -f 'java.*poker-0.0.1-SNAPSHOT.jar' || true); do
    if [[ "$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)" == "$target" ]] &&
            tr '\0' '\n' < "/proc/$pid/cmdline" | grep -qx 'poker-0.0.1-SNAPSHOT.jar'; then
        old_pids+=("$pid")
    fi
done
test "${#old_pids[@]}" = 1
old_pid=${old_pids[0]}
cd "$stage"
sha256sum -c SHA256SUMS
bash -n deploy-poker.sh
if ss -ltn | grep -q ':18083 '; then printf 'Port 18083 already in use\n'; exit 1; fi
install -d -m 700 "$backup/data" "$backup/check"
cp "$target/poker-0.0.1-SNAPSHOT.jar" "$backup/"
if [[ -f "$target/config/application.properties" ]]; then cp "$target/config/application.properties" "$backup/"; fi
tar -czf "$backup/frontend.tar.gz" -C /var/www/html .
python3 - "$backup/poker-0.0.1-SNAPSHOT.jar" "$stage/poker-0.0.1-SNAPSHOT.jar" "$backup" <<'PY'
import pathlib,sys,zipfile
for source,target in zip(sys.argv[1:3], ['old-h2.jar','new-h2.jar']):
    with zipfile.ZipFile(source) as jar:
        names=[n for n in jar.namelist() if n.startswith('BOOT-INF/lib/h2-') and n.endswith('.jar')]
        assert len(names)==1
        pathlib.Path(sys.argv[3],target).write_bytes(jar.read(names[0]))
PY

trap restore_old ERR
kill -TERM "$old_pid"
stopped=1
wait_stopped "$old_pid"
cp "$target/data/poker-auth.mv.db" "$backup/data/"
cp "$backup/data/poker-auth.mv.db" "$backup/check/candidate.mv.db"
java --class-path "$backup/old-h2.jar" "$stage/WechatDataCheck.java" \
    "jdbc:h2:file:$backup/data/poker-auth;MODE=MYSQL;NON_KEYWORDS=USER;IFEXISTS=TRUE" > "$backup/before.txt"
cat "$backup/before.txt"

cd "$backup/check"
nohup java -jar "$stage/poker-0.0.1-SNAPSHOT.jar" \
    --server.address=127.0.0.1 --server.port=18083 --spring.profiles.active=local-h2 \
    "--spring.datasource.url=jdbc:h2:file:$backup/check/candidate;MODE=MYSQL;NON_KEYWORDS=USER;IFEXISTS=TRUE" \
    --spring.datasource.username=sa --spring.datasource.password= --app.data-migration.mode=none \
    --app.wechat.enabled=false --app.avatar-oss.enabled=false > "$backup/candidate.log" 2>&1 < /dev/null &
candidate_pid=$!
wait_config 18083
kill -TERM "$candidate_pid"
wait_stopped "$candidate_pid"
candidate_pid=
java --class-path "$backup/new-h2.jar" "$stage/WechatDataCheck.java" \
    "jdbc:h2:file:$backup/check/candidate;MODE=MYSQL;NON_KEYWORDS=USER;IFEXISTS=TRUE" upgraded > "$backup/after.txt"
diff -u "$backup/before.txt" "$backup/after.txt"
printf 'Legacy account and progress checks passed\n'

replaced=1
cp "$stage/poker-0.0.1-SNAPSHOT.jar" "$target/poker-0.0.1-SNAPSHOT.jar"
tar -xzf "$stage/frontend.tar.gz" -C /var/www/html
cd "$target"
nohup java -jar poker-0.0.1-SNAPSHOT.jar > game.log 2>&1 < /dev/null &
new_pid=$!
wait_config 8080
for route in wechat/exchange wechat/login wechat/register wechat/bind credentials wechat/profile; do
    code=$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -d '{}' "http://127.0.0.1:8080/api/auth/$route")
    test "$code" = 400
    printf '/api/auth/%s status=%s\n' "$route" "$code"
done
trap - ERR
printf 'DEPLOYMENT_OK pid=%s backup=%s\n' "$new_pid" "$backup"
