#!/bin/bash
# Quiz numbers from the anonymous `results` table (plus sign-ups), the metrics the client brief
# asks for: completion, flavour split, shares, click-throughs, retail preference, opt-in rate,
# and how often "Did we nail it?" agreed with the quiz.
#   deploy/stats.sh                 all time
#   deploy/stats.sh 2026-11-07      one day (UTC; SAST is UTC+2)
#   deploy/stats.sh --csv > runs.csv   every run as CSV (anonymous)
# Needs Tailscale on and the `powerher` host in ~/.ssh/config.
set -euo pipefail
HOST=${DEPLOY_HOST:-powerher}

if [ "${1:-}" = "--csv" ]; then
  ssh -o BatchMode=yes "$HOST" "sudo mariadb hopnosis --batch -e \"
    SELECT started_at, finished_at, source, flavour, tiebreak, picks, nailed, age_band, city, suburb, channels,
           insight_skipped, shares, squares, shop_clicks, mix_clicks, optins
    FROM results ORDER BY started_at\"" |
    python3 -c 'import csv,sys; w=csv.writer(sys.stdout); [w.writerow("" if c=="NULL" else c for c in l.rstrip("\n").split("\t")) for l in sys.stdin]'
  exit 0
fi

WHERE="1=1"
if [ -n "${1:-}" ]; then
  [[ "$1" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "Date must be YYYY-MM-DD" >&2; exit 1; }
  WHERE="DATE(started_at) = '$1'"
fi

ssh -o BatchMode=yes "$HOST" "sudo mariadb hopnosis --table -e \"
SELECT COUNT(*) AS started, COALESCE(SUM(finished_at IS NOT NULL), 0) AS finished,
       COALESCE(CONCAT(ROUND(100 * COALESCE(SUM(finished_at IS NOT NULL), 0) / NULLIF(COUNT(*), 0)), '%'), '-') AS completion,
       COALESCE(SUM(tiebreak IS NOT NULL), 0) AS tiebreaks
FROM results WHERE $WHERE;

SELECT flavour, COUNT(*) AS results, CONCAT(ROUND(100 * COUNT(*) / SUM(COUNT(*)) OVER ()), '%') AS share
FROM results WHERE $WHERE AND flavour IS NOT NULL GROUP BY flavour ORDER BY results DESC;

SELECT COUNT(nailed) AS answered_nail_it,
       COALESCE(SUM(nailed = flavour), 0) AS quiz_was_right,
       COALESCE(SUM(nailed = 'untried'), 0) AS havent_tried,
       COALESCE(CONCAT(ROUND(100 * COALESCE(SUM(nailed = flavour), 0) / NULLIF(COALESCE(SUM(nailed IS NOT NULL AND nailed <> 'untried'), 0), 0)), '%'), '-') AS hit_rate
FROM results WHERE $WHERE;

SELECT nailed AS actual_favourite, COUNT(*) AS people FROM results
WHERE $WHERE AND nailed IS NOT NULL GROUP BY nailed ORDER BY people DESC;

SELECT COALESCE(SUM(shares > 0), 0) AS runs_shared, COALESCE(SUM(squares > 0), 0) AS runs_saved_square,
       COALESCE(SUM(shop_clicks > 0), 0) AS runs_clicked_shop, COALESCE(SUM(mix_clicks > 0), 0) AS runs_clicked_mixed,
       COALESCE(SUM(optins > 0), 0) AS runs_opted_in,
       COALESCE(CONCAT(ROUND(100 * COALESCE(SUM(optins > 0), 0) / NULLIF(COALESCE(SUM(finished_at IS NOT NULL), 0), 0)), '%'), '-') AS optin_rate
FROM results WHERE $WHERE;

SELECT COALESCE(source, '(none)') AS source, COUNT(*) AS runs FROM results WHERE $WHERE GROUP BY source ORDER BY runs DESC;

SELECT age_band, COUNT(*) AS people FROM results WHERE $WHERE AND age_band IS NOT NULL GROUP BY age_band ORDER BY age_band;
SELECT city, COUNT(*) AS people FROM results WHERE $WHERE AND city IS NOT NULL GROUP BY city ORDER BY people DESC;

SELECT 'supermarket' AS channel, COALESCE(SUM(FIND_IN_SET('supermarket', channels) > 0), 0) AS people FROM results WHERE $WHERE
UNION ALL SELECT 'gym or padel', COALESCE(SUM(FIND_IN_SET('gym', channels) > 0), 0) FROM results WHERE $WHERE
UNION ALL SELECT 'restaurants and bars', COALESCE(SUM(FIND_IN_SET('bars', channels) > 0), 0) FROM results WHERE $WHERE
UNION ALL SELECT 'petrol or convenience', COALESCE(SUM(FIND_IN_SET('convenience', channels) > 0), 0) FROM results WHERE $WHERE
UNION ALL SELECT 'festivals and events', COALESCE(SUM(FIND_IN_SET('events', channels) > 0), 0) FROM results WHERE $WHERE
UNION ALL SELECT 'online', COALESCE(SUM(FIND_IN_SET('online', channels) > 0), 0) FROM results WHERE $WHERE
ORDER BY people DESC;
\""
