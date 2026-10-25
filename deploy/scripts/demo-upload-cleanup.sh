#!/usr/bin/env bash
# Remove demos uploaded by demo-upload-replay.sh (or one named demo) from
# prod: the S3 object, the demo row (player rows, stat facts and match links
# cascade), and demo-stats' local copy and parse output.
#
# Usage (normally via `just cleanup-demo-upload ...`):
#   demo-upload-cleanup.sh [--name FILE_NAME] [--yes]
#
#   (no --name)  every demo whose file name starts with `replaytest-`
#   --name       exactly one demo, by file name (any prefix, e.g. a real
#                MatchZy upload you want gone)
#   --yes        skip the confirmation prompt
#
# Env: PORTAL_HOST (the justfile sets it from the inventory), SSH_USER
# (default ops).
set -euo pipefail

: "${PORTAL_HOST:?PORTAL_HOST must be set}"
SSH_USER="${SSH_USER:-ops}"

name=""
yes=0
while [ $# -gt 0 ]; do
    case "$1" in
        --name) name="$2"; shift 2 ;;
        --yes) yes=1; shift ;;
        -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
        *) echo "unknown argument: $1" >&2; exit 2 ;;
    esac
done
# File names the upload handler produces are [A-Za-z0-9._-] only; anything
# else is a typo, and refusing it keeps the SQL below free of quoting.
if [ -n "$name" ] && ! [[ "$name" =~ ^[A-Za-z0-9._-]+$ ]]; then
    echo "--name must be a stored demo file name ([A-Za-z0-9._-])" >&2
    exit 2
fi
if [ -n "$name" ]; then
    where="d.file_name = '$name'"
else
    where="d.file_name LIKE 'replaytest-%'"
fi

portal() { ssh "$SSH_USER@$PORTAL_HOST" "$@"; }
portal_sql() {
    portal "sudo -u portal psql -d portal_prod -v ON_ERROR_STOP=1 -AtF '|' -c \"$1\""
}

rows=$(portal_sql "SELECT d.id, d.file_name, d.s3_bucket, d.s3_key, d.status, COALESCE(pg_size_pretty(d.file_size_bytes), '?'), (SELECT COUNT(*) FROM demo_match_links l WHERE l.demo_id = d.id) FROM demos d WHERE $where ORDER BY d.discovered_at")
if [ -z "$rows" ]; then
    echo "nothing to clean up"
    exit 0
fi

echo "── will delete"
while IFS='|' read -r id file bucket key status size links; do
    printf '  %s  %-8s %6s  links=%s  s3://%s/%s\n' "$id" "$status" "$size" "$links" "$bucket" "$key"
done <<<"$rows"
if grep -q '|[1-9][0-9]*$' <<<"$rows"; then
    echo "  note: some are linked to a match; the links go with them"
fi

if [ "$yes" != 1 ]; then
    read -r -p "Delete these $(wc -l <<<"$rows") demo(s) from prod? [y/N] " answer
    [[ "$answer" =~ ^[Yy]$ ]] || { echo "aborted"; exit 1; }
fi

# Objects first: a row without an object is a dead link, but an object
# without a row is just re-cataloged by the scanner's next sweep.
echo "── S3 objects"
while IFS='|' read -r id file bucket key status size links; do
    portal "sudo bash -s" <<EOF
set -euo pipefail
set -a; . /etc/portal/api.env; set +a
export AWS_DEFAULT_REGION="\${S3_DEMOS_REGION:-\$S3_EVIDENCE_REGION}"
aws --endpoint-url "\${S3_DEMOS_ENDPOINT:-\$S3_EVIDENCE_ENDPOINT}" s3 rm 's3://$bucket/$key' --only-show-errors
echo "  removed s3://$bucket/$key"
EOF
done <<<"$rows"

echo "── demo-stats local files"
while IFS='|' read -r id file bucket key status size links; do
    obj=$(basename "$key")
    stats="${obj%.bz2}"; stats="${stats%.dem}.dem.stats.json"
    portal "sudo rm -fv '/var/lib/portal-demo-stats/demos/$obj' '/var/lib/portal-demo-stats/stats/$stats'" | sed 's/^/  /'
done <<<"$rows"

echo "── database"
ids=$(cut -d'|' -f1 <<<"$rows" | sed "s/.*/'&'/" | paste -sd,)
portal_sql "BEGIN; UPDATE discovered_matches SET demo_id = NULL WHERE demo_id IN ($ids); DELETE FROM demos WHERE id IN ($ids); COMMIT;" | sed 's/^/  /'
echo "done"
