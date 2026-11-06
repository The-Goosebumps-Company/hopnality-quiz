<?php
// Read-only views for the hopnøsis quiz admin: the brief's metrics (completion, flavour split,
// shares, click-throughs, retail preference, opt-in rate) plus "Did we nail it?" and sign-ups.
// Days are South African time (SAST, UTC+2). Pattern and helpers follow PowerHER's admin_data.php.
declare(strict_types=1);
require_once __DIR__ . '/admin_auth.php';

const HQ_FLAVOURS = ['classic' => 'Classic AF', 'mango' => 'Mango AF', 'lime' => 'Lime AF', 'unicorn' => 'Unicorn AF'];
const HQ_ARCHETYPES = ['classic' => 'The Smooth Operator', 'mango' => 'The Main Character', 'lime' => 'The Wild Card', 'unicorn' => 'The Perfect Storm'];
const HQ_REAL_FLAVOURS = ['classic' => 'Classic AF', 'mango' => 'Mango AF', 'lime' => 'Lime AF'];
// Short names for the seven questions, in quiz order (quiz/data.js).
const HQ_QUESTIONS = ['Friday night', 'Your fridge', 'Friends say', 'Versions of you', 'Sipping situation', 'A new drink', 'Where to bump into us'];
const HQ_CHANNELS = ['supermarket' => 'Supermarket', 'gym' => 'Gym or padel', 'bars' => 'Restaurants and bars',
    'convenience' => 'Petrol or convenience', 'events' => 'Festivals and events', 'online' => 'Online'];
const HQ_AGE_BANDS = ['Under 18', '18–24', '25–34', '35–44', '45–54', '55+'];
const HQ_SAST = "CONVERT_TZ(%s, '+00:00', '+02:00')";

function q1(string $sql, array $args = []) { $s = hq_db()->prepare($sql); $s->execute($args); return $s->fetchColumn(); }
function qall(string $sql, array $args = []): array { $s = hq_db()->prepare($sql); $s->execute($args); return $s->fetchAll(); }
function per_page(array $q, int $default): int { $n = (int)($q['perPage'] ?? $default); return in_array($n, [10, 25, 50, 100], true) ? $n : $default; }
function sast(string $col): string { return sprintf(HQ_SAST, $col); }

/** WHERE clause for the shared filters: ?day=YYYY-MM-DD (SAST) and ?source=can|poster|board|none. */
function run_filter(array $q, string $dateCol = 'started_at'): array
{
    $where = []; $args = [];
    $day = (string)($q['day'] ?? '');
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $day)) { $where[] = 'DATE(' . sast($dateCol) . ') = ?'; $args[] = $day; }
    $source = (string)($q['source'] ?? '');
    if ($source === 'none') $where[] = 'source IS NULL';
    elseif (preg_match('/^[a-z0-9_-]{1,32}$/', $source)) { $where[] = 'source = ?'; $args[] = $source; }
    return [$where ? ' WHERE ' . implode(' AND ', $where) : '', $args];
}
function and_where(string $sql, string $cond): string { return $sql === '' ? " WHERE $cond" : "$sql AND $cond"; }

/** Cheap poll for the live layer: counts plus a version that changes when anything new lands. */
function pulse(): array
{
    $r = qall('SELECT COUNT(*) AS started, COALESCE(SUM(finished_at IS NOT NULL), 0) AS finished, COALESCE(MAX(id), 0) AS maxid,
        COALESCE(SUM(nailed IS NOT NULL) + SUM(shares) + SUM(shop_clicks) + SUM(mix_clicks) + SUM(optins) + SUM(age_band IS NOT NULL), 0) AS touches FROM results')[0];
    $signups = (int)q1('SELECT COUNT(*) FROM subscribers');
    return ['counts' => ['started' => (int)$r['started'], 'finished' => (int)$r['finished'], 'signups' => $signups],
        'version' => implode('.', [$r['maxid'], $r['finished'], $r['touches'], $signups])];
}

/** Filter options: days that have runs, and the sources seen. */
function filters(): array
{
    $days = qall('SELECT DATE(' . sast('started_at') . ') AS day, COUNT(*) AS runs FROM results GROUP BY day ORDER BY day DESC LIMIT 60');
    $sources = qall('SELECT COALESCE(source, \'none\') AS source, COUNT(*) AS runs FROM results GROUP BY source ORDER BY runs DESC');
    return ['days' => array_map(fn($d) => ['day' => $d['day'], 'runs' => (int)$d['runs']], $days),
        'sources' => array_map(fn($s) => ['source' => $s['source'], 'runs' => (int)$s['runs']], $sources)];
}

function overview(array $q): array
{
    [$w, $a] = run_filter($q);
    $k = qall("SELECT COUNT(*) AS started, COALESCE(SUM(finished_at IS NOT NULL), 0) AS finished,
        COALESCE(SUM(tiebreak IS NOT NULL), 0) AS tiebreaks,
        COALESCE(SUM(nailed IS NOT NULL), 0) AS nail_answered,
        COALESCE(SUM(nailed = flavour), 0) AS nail_right,
        COALESCE(SUM(nailed = 'untried'), 0) AS nail_untried,
        COALESCE(SUM(shares > 0), 0) AS shared, COALESCE(SUM(squares > 0), 0) AS squares,
        COALESCE(SUM(shop_clicks > 0), 0) AS shop, COALESCE(SUM(mix_clicks > 0), 0) AS mix,
        COALESCE(SUM(optins > 0), 0) AS optins,
        COALESCE(SUM(age_band IS NOT NULL OR city IS NOT NULL OR channels IS NOT NULL), 0) AS insights,
        MIN(started_at) AS first, MAX(started_at) AS last FROM results$w", $a)[0];
    $k = array_map(fn($v) => is_numeric($v) ? (int)$v : $v, $k);

    $flavours = [];
    $rows = qall("SELECT flavour, COUNT(*) AS n FROM results" . and_where($w, 'flavour IS NOT NULL') . ' GROUP BY flavour', $a);
    $byFlavour = array_column($rows, 'n', 'flavour');
    foreach (HQ_FLAVOURS as $key => $label) $flavours[] = ['key' => $key, 'label' => $label, 'archetype' => HQ_ARCHETYPES[$key], 'count' => (int)($byFlavour[$key] ?? 0)];

    // Did we nail it? Quiz result (rows) against the flavour people say they actually prefer (columns).
    $matrix = [];
    foreach (qall("SELECT flavour, nailed, COUNT(*) AS n FROM results" . and_where($w, 'flavour IS NOT NULL AND nailed IS NOT NULL') . ' GROUP BY flavour, nailed', $a) as $r) {
        $matrix[$r['flavour']][$r['nailed']] = (int)$r['n'];
    }
    $actual = [];
    foreach (array_merge(HQ_REAL_FLAVOURS, ['untried' => 'Haven’t tried yet']) as $key => $label) {
        $actual[] = ['key' => $key, 'label' => $label, 'count' => array_sum(array_map(fn($row) => $row[$key] ?? 0, $matrix))];
    }

    // Activity over time: per hour for a single day, otherwise per day.
    $single = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($q['day'] ?? ''));
    $bucket = $single ? 'HOUR(' . sast('started_at') . ')' : 'DATE(' . sast('started_at') . ')';
    $series = qall("SELECT $bucket AS b, COUNT(*) AS started, COALESCE(SUM(finished_at IS NOT NULL), 0) AS finished FROM results$w GROUP BY b ORDER BY b", $a);
    if ($single) {
        $byHour = array_column($series, null, 'b');
        $first = $series ? (int)$series[0]['b'] : 9; $last = $series ? (int)end($series)['b'] : 17;
        $series = [];
        for ($h = min($first, 9); $h <= max($last, 17); $h++) $series[] = ['label' => sprintf('%02d:00', $h), 'started' => (int)($byHour[$h]['started'] ?? 0), 'finished' => (int)($byHour[$h]['finished'] ?? 0)];
    } else {
        $series = array_map(fn($r) => ['label' => substr((string)$r['b'], 5), 'tip' => (string)$r['b'], 'started' => (int)$r['started'], 'finished' => (int)$r['finished']], array_slice($series, -30));
    }

    $sources = qall("SELECT COALESCE(source, 'none') AS source, COUNT(*) AS runs, COALESCE(SUM(finished_at IS NOT NULL), 0) AS finished FROM results$w GROUP BY source ORDER BY runs DESC", $a);
    // Sign-ups: count by consent date in the same window (the email table is separate from runs by design).
    [$sw, $sa] = run_filter($q, 'created_at');
    $signups = (int)q1("SELECT COUNT(*) FROM subscribers$sw", $sa);

    return [
        'kpis' => $k + ['signups' => $signups],
        'flavours' => $flavours,
        'nail' => ['actual' => $actual, 'matrix' => $matrix],
        'series' => ['unit' => $single ? 'hour' : 'day', 'points' => $series],
        'sources' => array_map(fn($s) => ['source' => $s['source'], 'runs' => (int)$s['runs'], 'finished' => (int)$s['finished']], $sources),
        'recent' => recent_runs($w, $a),
    ];
}

function recent_runs(string $w, array $a): array
{
    $rows = qall("SELECT id, started_at, finished_at, flavour, tiebreak, nailed, source, shares, shop_clicks, mix_clicks, optins FROM results"
        . and_where($w, 'finished_at IS NOT NULL') . ' ORDER BY finished_at DESC, id DESC LIMIT 12', $a);
    return array_map(fn($r) => ['id' => (int)$r['id'], 'at' => $r['finished_at'] . 'Z', 'flavour' => $r['flavour'], 'tiebreak' => $r['tiebreak'] !== null,
        'nailed' => $r['nailed'], 'source' => $r['source'], 'shared' => $r['shares'] > 0, 'shop' => $r['shop_clicks'] > 0,
        'mix' => $r['mix_clicks'] > 0, 'optin' => $r['optins'] > 0], $rows);
}

function insights(array $q): array
{
    [$w, $a] = run_filter($q);
    $count = fn(string $col, array $keys) => (function () use ($col, $keys, $w, $a) {
        $rows = array_column(qall("SELECT $col AS k, COUNT(*) AS n FROM results" . and_where($w, "$col IS NOT NULL") . " GROUP BY $col", $a), 'n', 'k');
        return array_map(fn($k) => ['key' => $k, 'label' => $k, 'count' => (int)($rows[$k] ?? 0)], $keys);
    })();
    $channels = [];
    foreach (HQ_CHANNELS as $key => $label) {
        $channels[] = ['key' => $key, 'label' => $label, 'count' => (int)q1("SELECT COUNT(*) FROM results" . and_where($w, 'FIND_IN_SET(?, channels) > 0'), array_merge($a, [$key]))];
    }
    usort($channels, fn($x, $y) => $y['count'] <=> $x['count']);
    $cities = qall("SELECT city AS label, COUNT(*) AS count FROM results" . and_where($w, 'city IS NOT NULL') . ' GROUP BY city ORDER BY count DESC', $a);
    $suburbs = qall("SELECT suburb AS label, COUNT(*) AS count FROM results" . and_where($w, 'suburb IS NOT NULL') . ' GROUP BY suburb ORDER BY count DESC LIMIT 15', $a);
    $answered = (int)q1("SELECT COUNT(*) FROM results" . and_where($w, '(age_band IS NOT NULL OR city IS NOT NULL OR channels IS NOT NULL)'), $a);
    $skipped = (int)q1("SELECT COUNT(*) FROM results" . and_where($w, 'insight_skipped = 1'), $a);

    // Which flavour each question pulls towards (finished runs only).
    $questions = [];
    $picks = qall("SELECT picks FROM results" . and_where($w, 'picks IS NOT NULL'), $a);
    $tally = array_fill(0, count(HQ_QUESTIONS), array_fill_keys(array_keys(HQ_FLAVOURS), 0));
    foreach ($picks as $p) foreach (explode(',', $p['picks']) as $i => $f) if (isset($tally[$i][$f])) $tally[$i][$f]++;
    foreach (HQ_QUESTIONS as $i => $label) $questions[] = ['label' => $label, 'counts' => $tally[$i]];

    return [
        'answered' => $answered, 'skipped' => $skipped,
        'ages' => $count('age_band', HQ_AGE_BANDS),
        'cities' => array_map(fn($r) => ['label' => $r['label'], 'count' => (int)$r['count']], $cities),
        'suburbs' => array_map(fn($r) => ['label' => $r['label'], 'count' => (int)$r['count']], $suburbs),
        'channels' => $channels,
        'questions' => $questions,
    ];
}

function signups(array $q): array
{
    [$w, $a] = run_filter($q, 'created_at');
    $search = trim((string)($q['search'] ?? ''));
    if ($search !== '') { $w = and_where($w, 'email LIKE ?'); $a[] = '%' . addcslashes(mb_substr($search, 0, 100), '%_\\') . '%'; }
    $per = per_page($q, 25); $page = max(1, (int)($q['page'] ?? 1));
    $total = (int)q1("SELECT COUNT(*) FROM subscribers$w", $a);
    $rows = qall("SELECT id, email, flavour, source, consent_text, consented_at, created_at FROM subscribers$w ORDER BY id DESC LIMIT $per OFFSET " . (($page - 1) * $per), $a);
    $byFlavour = array_column(qall("SELECT flavour, COUNT(*) AS n FROM subscribers$w GROUP BY flavour", $a), 'n', 'flavour');
    return ['total' => $total, 'page' => $page, 'perPage' => $per,
        'flavours' => array_map(fn($k) => ['key' => $k, 'label' => HQ_FLAVOURS[$k], 'count' => (int)($byFlavour[$k] ?? 0)], array_keys(HQ_FLAVOURS)),
        'rows' => array_map(fn($r) => ['id' => (int)$r['id'], 'email' => $r['email'], 'flavour' => $r['flavour'], 'source' => $r['source'],
            'consent' => $r['consent_text'], 'consentedAt' => $r['consented_at'] . 'Z', 'firstAt' => $r['created_at'] . 'Z'], $rows)];
}

function audit_log(array $q): array
{
    $where = []; $args = [];
    $search = trim((string)($q['search'] ?? ''));
    if ($search !== '') { $like = '%' . addcslashes(mb_substr($search, 0, 100), '%_\\') . '%'; $where[] = '(email LIKE ? OR action LIKE ? OR detail LIKE ? OR ip LIKE ?)'; array_push($args, $like, $like, $like, $like); }
    $sql = $where ? ' WHERE ' . implode(' AND ', $where) : '';
    $per = per_page($q, 50); $page = max(1, (int)($q['page'] ?? 1));
    $total = (int)q1("SELECT COUNT(*) FROM admin_audit$sql", $args);
    $rows = qall("SELECT email, action, detail, ip, created_at FROM admin_audit$sql ORDER BY id DESC LIMIT $per OFFSET " . (($page - 1) * $per), $args);
    return ['total' => $total, 'page' => $page, 'perPage' => $per, 'rows' => array_map(fn($r) => $r + ['at' => $r['created_at'] . 'Z'], $rows)];
}

// ---- CSV exports (streamed; sign-ups need a fresh 2FA step-up, enforced in admin.php) ----

function csv_out(string $name, array $header, iterable $rows): int
{
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $name . '"');
    header('Cache-Control: no-store');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF"); // UTF-8 BOM so Excel shows ø correctly
    fputcsv($out, $header);
    $n = 0;
    foreach ($rows as $r) {
        // Neutralise spreadsheet formulas in user-supplied cells.
        fputcsv($out, array_map(fn($v) => is_string($v) && preg_match('/^[=+\-@\t\r]/', $v) ? "'" . $v : $v, $r));
        $n++;
    }
    fclose($out);
    return $n;
}

function export_signups(array $q): int
{
    [$w, $a] = run_filter($q, 'created_at');
    $rows = qall("SELECT email, flavour, source, consent_text, consented_at, created_at FROM subscribers$w ORDER BY id", $a);
    return csv_out('hopnosis-signups-' . gmdate('Ymd-His') . '.csv',
        ['Email', 'Quiz result', 'Source', 'Consent wording', 'Consented at (UTC)', 'First signed up (UTC)'],
        array_map(fn($r) => [$r['email'], HQ_FLAVOURS[$r['flavour']] ?? '', $r['source'] ?? '', $r['consent_text'], $r['consented_at'], $r['created_at']], $rows));
}

function export_runs(array $q): int
{
    [$w, $a] = run_filter($q);
    $rows = qall("SELECT started_at, finished_at, source, flavour, tiebreak, picks, nailed, age_band, city, suburb, channels, insight_skipped,
        shares, squares, shop_clicks, mix_clicks, optins FROM results$w ORDER BY id", $a);
    return csv_out('hopnosis-quiz-runs-' . gmdate('Ymd-His') . '.csv',
        ['Started (UTC)', 'Finished (UTC)', 'Source', 'Result', 'Legacy tiebreak', 'Picks Q1–Q7', 'Actual favourite', 'Age', 'City', 'Suburb',
            'Where they’d buy', 'Skipped questions', 'Shares', 'Square saves', 'Shop clicks', 'Mixed pack clicks', 'Opted in'],
        array_map(fn($r) => array_values($r), $rows));
}
