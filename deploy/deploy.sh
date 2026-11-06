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

smoke() {  # Ask the box's own Apache for the live page, by name, and check it's the quiz.
  "${SSH[@]}" "if [ -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem ]; then
      curl -fsS --max-time 10 --resolve $DOMAIN:443:127.0.0.1 https://$DOMAIN/; else
      curl -fsS --max-time 10 -H 'Host: $DOMAIN' http://127.0.0.1/; fi" | grep -q 'data-screen="welcome"'
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
rsync -az --chmod=D755,F644 --link-dest="$BASE/current/" -e "ssh -o BatchMode=yes" \
  "$STAGE/release/" "$HOST:$BASE/releases/$REL/"
"${SSH[@]}" "echo $COMMIT > $BASE/releases/$REL.commit"

# 2. Re-apply server config (idempotent; also issues the certificate once DNS points here).
rsync -az -e "ssh -o BatchMode=yes" "$STAGE/deploy/server-setup.sh" "$HOST:/tmp/hopnosis-server-setup.sh"
"${SSH[@]}" "sudo bash /tmp/hopnosis-server-setup.sh && rm -f /tmp/hopnosis-server-setup.sh"

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
