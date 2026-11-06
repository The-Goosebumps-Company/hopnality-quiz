#!/bin/bash
# Export "Join the Hopnotised" sign-ups as CSV (contains personal data: don't commit or share widely).
#   deploy/export-subscribers.sh > ~/Downloads/hopnosis-subscribers.csv
#   deploy/export-subscribers.sh --count
# Needs Tailscale on and the `powerher` host in ~/.ssh/config.
set -euo pipefail
HOST=${DEPLOY_HOST:-powerher}
if [ "${1:-}" = "--count" ]; then
  ssh -o BatchMode=yes "$HOST" "sudo mariadb hopnosis -N -e \"SELECT COUNT(*), SUM(created_at >= UTC_DATE()) FROM subscribers\"" |
    awk -F'\t' '{print $1 " sign-ups in total, " ($2=="NULL"?0:$2) " today (UTC)"}'
  exit 0
fi
ssh -o BatchMode=yes "$HOST" "sudo mariadb hopnosis --batch -e \"
  SELECT email, flavour, source, consent_text, consented_at AS consented_at_utc, created_at AS first_signed_up_utc
  FROM subscribers ORDER BY created_at\"" |
  python3 -c 'import csv,sys; w=csv.writer(sys.stdout); [w.writerow("" if c=="NULL" else c for c in l.rstrip("\n").split("\t")) for l in sys.stdin]'
