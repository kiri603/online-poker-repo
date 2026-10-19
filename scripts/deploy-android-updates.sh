#!/usr/bin/env bash
set -euo pipefail

stage=${1:?staging directory required}
sequence=${2:?release sequence required}
expected_hash=${3:?archive SHA256 required}
[[ "$stage" =~ ^/tmp/poker-android-[0-9]+-[0-9]+$ ]] || { echo 'Invalid staging directory' >&2; exit 1; }
[[ "$sequence" =~ ^[0-9]+$ && "$expected_hash" =~ ^[a-f0-9]{64}$ ]] || { echo 'Invalid release metadata' >&2; exit 1; }
[[ "$(readlink -f "$stage")" == "$stage" && ! -L "$stage" ]] || { echo 'Unexpected staging path' >&2; exit 1; }
printf '%s  %s\n' "$expected_hash" "$stage/android-updates.tar.gz" | sha256sum -c -
mkdir "$stage/extracted"
tar -xzf "$stage/android-updates.tar.gz" -C "$stage/extracted" --no-same-owner

site_root=$(readlink -f /var/www/html)
[[ -d "$site_root" ]] || { echo 'Website directory is missing' >&2; exit 1; }
destination="$site_root/android-updates"
[[ ! -L "$destination" && ! -L "$destination/bundles" ]] || { echo 'Update destination must not be a symlink' >&2; exit 1; }
mkdir -p "$destination/bundles"
[[ "$(readlink -f "$destination/bundles")" == "$site_root/android-updates/bundles" ]] || { echo 'Update directory escapes website root' >&2; exit 1; }
bundle="$destination/bundles/$sequence"
source_bundle="$stage/extracted/android-updates/bundles/$sequence"
[[ -f "$source_bundle/index.html" && -f "$stage/extracted/android-updates/latest.json" ]] || { echo 'Incomplete release' >&2; exit 1; }
if [[ -e "$bundle" ]]; then
    [[ ! -L "$bundle" && -f "$bundle/.deployment-sha256" && "$(cat "$bundle/.deployment-sha256")" == "$expected_hash" ]] || { echo 'Immutable release already exists with different contents' >&2; exit 1; }
else
    mv -T "$source_bundle" "$bundle"
    printf '%s\n' "$expected_hash" > "$bundle/.deployment-sha256"
    chmod -R u=rwX,go=rX "$bundle"
fi

backup=/var/backups/poker-android-updates
mkdir -p "$backup"
chmod 700 "$backup"
previous="$backup/latest-before-$sequence-$(basename "$stage").json"
had_previous=0
if [[ -e "$destination/latest.json" ]]; then
    [[ -f "$destination/latest.json" && ! -L "$destination/latest.json" ]] || { echo 'Invalid existing version pointer' >&2; exit 1; }
    cp "$destination/latest.json" "$previous"
    had_previous=1
fi
switched=0
restore_on_failure() {
    status=$?
    if [[ "$status" != 0 && "$switched" == 1 ]]; then
        if [[ "$had_previous" == 1 ]]; then
            restore_file=$(mktemp "$destination/.rollback.XXXXXX")
            cp "$previous" "$restore_file"
            chmod 644 "$restore_file"
            mv -f "$restore_file" "$destination/latest.json"
        else
            # This pointer was created by this deployment and had no predecessor.
            rm -f -- "$destination/latest.json"
        fi
        echo 'Resource pointer restored after failed verification' >&2
    fi
}
trap restore_on_failure EXIT
next_file=$(mktemp "$destination/.latest.XXXXXX")
cp "$stage/extracted/android-updates/latest.json" "$next_file"
chmod 644 "$next_file"
mv -f "$next_file" "$destination/latest.json"
switched=1
curl --noproxy '*' -fsS --connect-timeout 10 --max-time 30 -H 'Host: 39.102.60.181' http://127.0.0.1/android-updates/latest.json -o "$stage/served-latest.json"
cmp "$destination/latest.json" "$stage/served-latest.json"
curl --noproxy '*' -fsS --connect-timeout 10 --max-time 30 -H 'Host: 39.102.60.181' "http://127.0.0.1/android-updates/bundles/$sequence/index.html" -o "$stage/served-index.html"
cmp "$bundle/index.html" "$stage/served-index.html"
echo "Published Android resource release $sequence"
