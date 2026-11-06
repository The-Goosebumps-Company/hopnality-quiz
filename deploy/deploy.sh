#!/bin/bash
# Deploy the quiz to https://quiz.hopnosis.co.za as an atomic release (same pattern as Pulse).
#
#   deploy/deploy.sh                 deploy HEAD (committed files only, never the working tree)
#   deploy/deploy.sh <commit>        deploy that commit
#   deploy/deploy.sh releases        list releases on the server
#   deploy/deploy.sh rollback        flip back to the previous release
#
# Needs Tailscale on and the `powerher` host in ~/.ssh/config (see the PowerHER runbook).
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=${DEPLOY_HOST:-powerher}
DOMAIN=quiz.hopnosis.co.za
BASE=/var/www/$DOMAIN
KEEP=5
# What gets published. Anything else in the repo (README, deploy/, .nojekyll) stays private.
WEB_PATHS=(index.html styles.css data.js app.js assets api)

SSH=(ssh -o BatchMode=yes "$HOST")

smoke() {  # Ask the box's own Apache for the live site, by name.
  "${SSH[@]}" "set -e
    # /etc/letsencrypt/live is root-only, so check with sudo (plain -f is always false as ubuntu).
    if sudo test -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem; then
      C='curl -fsS --max-time 10 --resolve $DOMAIN:443:127.0.0.1'; U=https://$DOMAIN
    else
      C='curl -fsS --max-time 10 --resolve $DOMAIN:80:127.0.0.1'; U=http://$DOMAIN
    fi
    \$C \$U/ | grep -q 'data-screen=\"welcome\"'
    # Sign-up endpoint: a honeypot hit reaches the DB (rate limit) but stores nothing.
    if \$C -o /dev/null \$U/api/subscribe.php -H 'Content-Type: application/json' -H \"Origin: \$U\" \\
         -d '{\"website\":\"smoke-test\"}' 2>/dev/null || [ ! -e $BASE/current/api ]; then :; else exit 1; fi"
}

case "${1:-}" in
  releases)
    "${SSH[@]}" "cd $BASE/releases && for r in \$(ls -1 | grep -v '\.commit\$'); do
      mark=' '; [ \"\$(readlink -f $BASE/current)\" = \"$BASE/releases/\$r\" ] && mark='*'
      echo \"\$mark \$r \$(cat \$r.commit 2>/dev/null)\"; done"
    exit 0 ;;
  rollback)
    "${SSH[@]}" "set -e; cd $BASE/releases
      cur=\$(basename \$(readlink -f $BASE/current))
      prev=\$(ls -1 | grep -v '\.commit\$' | grep -v '^00000000000000\$' | sort | awk -v c=\$cur '\$0<c' | tail -1)
      [ -n \"\$prev\" ] || { echo 'No earlier release.'; exit 1; }
      ln -sfn $BASE/releases/\$prev $BASE/current.next && mv -T $BASE/current.next $BASE/current
      echo \"rolled back \$cur -> \$prev\""
    smoke && echo "smoke test ok" || { echo "SMOKE TEST FAILED after rollback" >&2; exit 1; }
    exit 0 ;;
esac

REF=${1:-HEAD}
COMMIT=$(git rev-parse --verify "$REF^{commit}")
if [ "$REF" = HEAD ] && [ -n "$(git status --porcelain)" ]; then
  echo "Note: uncommitted changes are NOT deployed. Deploying $(git log -1 --format='%h %s' "$COMMIT")." >&2
fi
PRESENT=()
for p in "${WEB_PATHS[@]}"; do git cat-file -e "$COMMIT:$p" 2>/dev/null && PRESENT+=("$p"); done

REL=$(date -u +%Y%m%d%H%M%S)
STAGE=$(mktemp -d); trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/release"
git archive "$COMMIT" "${PRESENT[@]}" | tar -x -C "$STAGE/release"
git archive "$COMMIT" deploy/server-setup.sh | tar -x -C "$STAGE"

# 1. Upload the new release beside the live one (hard-links unchanged files).
"${SSH[@]}" "test -d $BASE/releases" || {
  echo "First deploy: setting up the server."
  rsync -az -e "ssh -o BatchMode=yes" "$STAGE/deploy/server-setup.sh" "$HOST:/tmp/hopnosis-server-setup.sh"
  "${SSH[@]}" "sudo bash /tmp/hopnosis-server-setup.sh && rm -f /tmp/hopnosis-server-setup.sh"
}
rsync -az --link-dest="$BASE/current/" -e "ssh -o BatchMode=yes" \
  "$STAGE/release/" "$HOST:$BASE/releases/$REL/"
"${SSH[@]}" "chmod -R u=rwX,go=rX $BASE/releases/$REL && echo $COMMIT > $BASE/releases/$REL.commit"

# 2. Re-apply server config and the new release's schema (idempotent; also issues the
#    certificate once DNS points here).
rsync -az -e "ssh -o BatchMode=yes" "$STAGE/deploy/server-setup.sh" "$HOST:/tmp/hopnosis-server-setup.sh"
"${SSH[@]}" "sudo bash /tmp/hopnosis-server-setup.sh $BASE/releases/$REL && rm -f /tmp/hopnosis-server-setup.sh"

# 3. Atomic flip, then smoke test; flip straight back if it fails.
PREV=$("${SSH[@]}" "readlink -f $BASE/current")
"${SSH[@]}" "ln -sfn $BASE/releases/$REL $BASE/current.next && mv -T $BASE/current.next $BASE/current"
if smoke; then
  echo "Live: $REL ($(git log -1 --format='%h %s' "$COMMIT"))"
else
  "${SSH[@]}" "ln -sfn $PREV $BASE/current.next && mv -T $BASE/current.next $BASE/current"
  echo "SMOKE TEST FAILED: flipped back to $(basename "$PREV")" >&2
  exit 1
fi

# 4. Keep the newest $KEEP releases (never the live one).
"${SSH[@]}" "cd $BASE/releases && cur=\$(basename \$(readlink -f $BASE/current))
  ls -1 | grep -v '\.commit\$' | sort | head -n -$KEEP | while read r; do
    [ \"\$r\" = \"\$cur\" ] || rm -rf \"\$r\" \"\$r.commit\"; done"
