<?php
// POST api/track.php: anonymous quiz analytics, one row per quiz run (table `results`).
// The client brief asks us to track completion, flavour split, shares, click-throughs, retail
// preference and opt-in rate, plus "Did we nail it?" and the optional research questions.
// No personal data: no IP, no email, no name. The row is addressed by a random token only the
// browser that started the run knows.
//
// Actions: start {source} → {id} · finish {id, flavour, picks[6], tiebreak}
//          nail {id, value} · insight {id, age_band, city, suburb, channels[] | skipped}
//          event {id, event: share|square|shop|mix|optin}
declare(strict_types=1);
require __DIR__ . '/lib.php';

// Must match data.js (insight.ageBands / insight.cities / insight.channels).
const AGE_BANDS = ['Under 18', '18–24', '25–34', '35–44', '45–54', '55+'];
const CITIES = ['Johannesburg', 'Pretoria', 'Cape Town', 'Durban', 'Gqeberha', 'Bloemfontein', 'Somewhere else'];
const CHANNELS = ['supermarket', 'gym', 'bars', 'convenience', 'events', 'online'];
const NAIL = ['classic', 'mango', 'lime', 'untried'];
const TIEBREAKS = ['lime-mango', 'classic-lime', 'classic-mango'];
const EVENTS = ['share' => 'shares', 'square' => 'squares', 'shop' => 'shop_clicks', 'mix' => 'mix_clicks', 'optin' => 'optins'];
const QUESTIONS = 6;

$data = read_json_post();
$db = db();
// A whole venue can share one Wi-Fi IP and each run makes several calls, so this is generous.
rate_limit($db, 'track', 1200, 300);

$action = $data['action'] ?? '';

if ($action === 'start') {
    $token = bin2hex(random_bytes(16));
    $db->prepare('INSERT INTO results (token, source, started_at) VALUES (?, ?, UTC_TIMESTAMP())')
       ->execute([$token, source_param($data['source'] ?? null)]);
    respond(200, true, 'ok', ['id' => $token]);
}

$token = is_string($data['id'] ?? null) && preg_match('/^[0-9a-f]{32}$/', $data['id']) ? $data['id'] : null;
if ($token === null) {
    respond(422, false, 'Unknown run.');
}

function update(PDO $db, string $token, string $set, array $params): void
{
    $stmt = $db->prepare("UPDATE results SET $set WHERE token = ?");
    $stmt->execute([...$params, $token]);
    respond(200, true, 'ok');
}

switch ($action) {
    case 'finish':
        $flavour = in_array($data['flavour'] ?? null, FLAVOURS, true) ? $data['flavour'] : null;
        $picks = $data['picks'] ?? null;
        if ($flavour === null || !is_array($picks) || count($picks) !== QUESTIONS
            || array_diff($picks, FLAVOURS) !== []) {
            respond(422, false, 'Bad result.');
        }
        $tiebreak = in_array($data['tiebreak'] ?? null, TIEBREAKS, true) ? $data['tiebreak'] : null;
        update($db, $token, 'finished_at = UTC_TIMESTAMP(), flavour = ?, picks = ?, tiebreak = ?',
            [$flavour, implode(',', $picks), $tiebreak]);

    case 'nail':
        $value = in_array($data['value'] ?? null, NAIL, true) ? $data['value'] : null;
        if ($value === null) {
            respond(422, false, 'Bad answer.');
        }
        update($db, $token, 'nailed = ?', [$value]);

    case 'insight':
        if (($data['skipped'] ?? false) === true) {
            update($db, $token, 'insight_skipped = 1', []);
        }
        $age = in_array($data['age_band'] ?? null, AGE_BANDS, true) ? $data['age_band'] : null;
        $city = in_array($data['city'] ?? null, CITIES, true) ? $data['city'] : null;
        $suburb = is_string($data['suburb'] ?? null) ? trim(strip_tags($data['suburb'])) : '';
        $suburb = $suburb === '' ? null : mb_substr($suburb, 0, 60);
        $channels = is_array($data['channels'] ?? null) ? array_values(array_intersect(CHANNELS, $data['channels'])) : [];
        update($db, $token, 'age_band = ?, city = ?, suburb = ?, channels = ?, insight_skipped = 0',
            [$age, $city, $suburb, $channels ? implode(',', $channels) : null]);

    case 'event':
        $column = EVENTS[$data['event'] ?? ''] ?? null;
        if ($column === null) {
            respond(422, false, 'Bad event.');
        }
        update($db, $token, "$column = $column + 1", []);

    default:
        respond(422, false, 'Unknown action.');
}
