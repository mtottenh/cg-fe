#!/usr/bin/env bash
# Replay a MatchZy demo upload against prod, exactly as MatchZy sends it.
#
# Runs curl ON THE GAME SERVER with that server's own demo token (read from
# the MatchZy config, never printed or put on a command line), so the request
# takes the real path: Caddy → POST /v1/gameserver/demos → S3 → catalog →
# demo-stats parse → scanner stats fetch. Then it watches the demo row on the
# portal host until it leaves `pending`.
#
# The upload is a REAL prod write: a demo row plus an S3 object in the demo
# bucket. Its file name starts with `replaytest-` so demo-upload-cleanup.sh
# can find and remove it.
#
# Usage (normally via `just replay-demo-upload ...`):
#   demo-upload-replay.sh [--file PATH] [--match-id N] [--map-number N]
#                         [--watch MINUTES] [--dry-run]
#
#   --file        demo on the game server (default: newest non-empty .dem in
#                 the MatchZy demo directory)
#   --match-id    sent as MatchZy-MatchId. Omit to land in matchzy/unmatched;
#                 pass a live reservation's matchzy_id to exercise linking.
#   --map-number  MatchZy-MapNumber, 0-indexed (default 0)
#   --watch       minutes to follow the demo row afterwards (default 10, 0 = off)
#   --dry-run     show what would be sent; upload nothing
#
# Env: PORTAL_HOST, GAME_HOST, DOMAIN (the justfile sets them from the
# inventory), SSH_USER (default ops).
set -euo pipefail

: "${PORTAL_HOST:?PORTAL_HOST must be set}"
: "${GAME_HOST:?GAME_HOST must be set}"
: "${DOMAIN:?DOMAIN must be set}"
SSH_USER="${SSH_USER:-ops}"

MATCHZY_CONFIG=/home/cs2server/serverfiles/game/csgo/cfg/MatchZy/config.cfg
DEMO_DIR=/home/cs2server/serverfiles/game/csgo/MatchZy

file=""
match_id=""
map_number=0
watch_minutes=10
dry_run=0
while [ $# -gt 0 ]; do
    case "$1" in
        --file) file="$2"; shift 2 ;;
        --match-id) match_id="$2"; shift 2 ;;
        --map-number) map_number="$2"; shift 2 ;;
        --watch) watch_minutes="$2"; shift 2 ;;
        --dry-run) dry_run=1; shift ;;
        -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
        *) echo "unknown argument: $1" >&2; exit 2 ;;
    esac
done
[[ -z "$match_id" || "$match_id" =~ ^[0-9]+$ ]] || { echo "--match-id must be a number" >&2; exit 2; }
[[ "$map_number" =~ ^[0-9]+$ ]] || { echo "--map-number must be a number" >&2; exit 2; }
[[ "$watch_minutes" =~ ^[0-9]+$ ]] || { echo "--watch must be a number of minutes" >&2; exit 2; }

game() { ssh "$SSH_USER@$GAME_HOST" "$@"; }
portal_sql() {
    ssh "$SSH_USER@$PORTAL_HOST" "sudo -u portal psql -d portal_prod -v ON_ERROR_STOP=1 -AtF '|' -c \"$1\""
}

if [ -z "$file" ]; then
    file=$(game "sudo find '$DEMO_DIR' -maxdepth 1 -name '*.dem' -size +0 -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2-")
    [ -n "$file" ] || { echo "no non-empty .dem in $DEMO_DIR on $GAME_HOST" >&2; exit 1; }
fi
size=$(game "sudo stat -c %s '$file'") || { echo "cannot read $file on $GAME_HOST" >&2; exit 1; }

# What the API will store it as: the handler keeps [A-Za-z0-9._-] only.
base=$(basename "$file")
name="replaytest-$(date -u +%Y%m%dT%H%M%SZ)-${base//[^A-Za-z0-9._-]/}"

echo "── replay"
echo "  game server : $GAME_HOST"
echo "  file        : $file ($(numfmt --to=iec "$size"))"
echo "  as          : $name"
echo "  match id    : ${match_id:-<none: matchzy/unmatched>}   map number: $map_number"
echo "  target      : https://$DOMAIN/v1/gameserver/demos"
if [ "$dry_run" = 1 ]; then
    echo "dry run: nothing sent"
    exit 0
fi

extra_headers="MatchZy-MapNumber: $map_number"
[ -n "$match_id" ] && extra_headers+=$'\n'"MatchZy-MatchId: $match_id"

# The token goes from the config file into curl's headers on stdin (-H @-),
# so it never appears in argv, the process list or this terminal.
echo "── uploading (this can take a minute for a 250 MB demo)"
result=$(game "sudo bash -s" <<EOF
set -euo pipefail
token=\$(grep -oP 'matchzy_demo_upload_header_value\s+"Bearer \K[^"]+' '$MATCHZY_CONFIG') || {
    echo "no demo token in $MATCHZY_CONFIG" >&2; exit 1; }
printf 'Authorization: Bearer %s\nMatchZy-FileName: %s\n%s\n' "\$token" '$name' '$extra_headers' |
curl -sS -o /tmp/replay-response.$$ -w '%{http_code} %{size_upload} %{time_total}' \
    -X POST 'https://$DOMAIN/v1/gameserver/demos' \
    -H @- -H 'Content-Type: application/octet-stream' \
    --data-binary @'$file'
echo
cat /tmp/replay-response.$$ 2>/dev/null; rm -f /tmp/replay-response.$$
EOF
)
read -r code sent seconds <<<"$(head -1 <<<"$result")"
body=$(tail -n +2 <<<"$result")
echo "  HTTP $code, sent $(numfmt --to=iec "${sent%.*}") in ${seconds}s"
[ -n "$body" ] && echo "  response: $body"
if [ "$code" != 200 ]; then
    echo "upload failed — the API logs why:" >&2
    ssh "$SSH_USER@$PORTAL_HOST" "journalctl -u portal-api --since '-5 min' --no-pager | grep -i 'demo upload' | tail -5" >&2 || true
    exit 1
fi

echo "── demo row"
row=$(portal_sql "SELECT d.id, d.status, d.s3_bucket || '/' || d.s3_key, COALESCE(l.match_id::text, '-') FROM demos d LEFT JOIN demo_match_links l ON l.demo_id = d.id WHERE d.file_name = '$name'")
[ -n "$row" ] || { echo "no demo row for $name — check: just logs" >&2; exit 1; }
IFS='|' read -r demo_id status object linked <<<"$row"
echo "  id     : $demo_id"
echo "  object : $object"
echo "  linked : $linked"
echo "  status : $status"

[ "$watch_minutes" = 0 ] && exit 0
echo "── watching for up to $watch_minutes min (demo-stats polls the bucket every 60s, the scanner every 60s)"
deadline=$(( $(date +%s) + watch_minutes * 60 ))
while [[ "$status" = pending || "$status" = processing ]] && [ "$(date +%s)" -lt "$deadline" ]; do
    sleep 30
    status=$(portal_sql "SELECT status FROM demos WHERE id = '$demo_id'")
    stats=$(ssh "$SSH_USER@$PORTAL_HOST" "curl -fsS localhost:3100/health" 2>/dev/null || echo '?')
    echo "  $(date -u +%H:%M:%S) status=$status demo-stats=$stats"
done

case "$status" in
    ready)
        echo "OK: stats landed."
        portal_sql "SELECT COUNT(*) || ' player rows' FROM demo_players WHERE demo_id = '$demo_id'" ;;
    pending|processing)
        echo "STILL PENDING after $watch_minutes min. Next places to look:" >&2
        echo "  ssh $SSH_USER@$PORTAL_HOST journalctl -u portal-demo-stats -u portal-scanner --since '-${watch_minutes} min'" >&2
        exit 1 ;;
    *)
        echo "demo ended in '$status':" >&2
        portal_sql "SELECT stats_fetch_error FROM demos WHERE id = '$demo_id'" >&2
        exit 1 ;;
esac
echo "Remove it with: just cleanup-demo-upload"
