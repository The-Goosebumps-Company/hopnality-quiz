<?php
// POST api/subscribe.php: "Join the Hopnotised" email sign-up on the result screen.
// Modelled on Pulse's public contact form (ContactController + PublicFormGuard + RateLimiter):
// honeypot and minimum-submit-time traps that answer bots with a fake success, a per-IP rate
// limit, strict validation, and the same {success, message, data} JSON shape.
// No CAPTCHA (event crowd on phones) and no email per sign-up (exported instead).
declare(strict_types=1);

const CONSENT_TEXT = 'Yes, hopnøsis can email me. Unsubscribe anytime.'; // must match index.html
const FLAVOURS = ['classic', 'mango', 'lime'];
const HONEYPOT_FIELDS = ['website', 'company_website', 'fax_number', '_gotcha', 'url'];
const MIN_SUBMIT_SECONDS = 2;
// Generous because a whole venue on one Wi-Fi network shares an IP.
const RATE_LIMIT = 40;
const RATE_WINDOW = 300;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function respond(int $status, bool $ok, string $message, array $data = []): never
{
    http_response_code($status);
    echo json_encode(['success' => $ok, 'message' => $message, 'data' => $data ?: null], JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    respond(405, false, 'Method not allowed.');
}

// Same-origin JSON only: a cross-site <form> can't send application/json, and browsers
// always send Origin on fetch POSTs.
$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? '')) {
    respond(403, false, 'Not allowed.');
}
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) {
    respond(415, false, 'Send JSON.');
}
$raw = file_get_contents('php://input', false, null, 0, 8192);
$data = json_decode((string) $raw, true);
if (!is_array($data)) {
    respond(400, false, 'That didn\'t go through. Try again in a moment.');
}

// .../quiz.hopnosis.co.za/releases/<ts>/api (or .../current/api) → .../quiz.hopnosis.co.za
$base = preg_replace('#/(releases/[^/]+|current)/api$#', '', __DIR__);
$settings = require $base . '/shared/config/settings.php';
try {
    $db = new PDO($settings['db_dsn'], $settings['db_user'], $settings['db_pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
} catch (Throwable $e) {
    error_log('[subscribe] DB connect failed: ' . $e->getMessage());
    respond(503, false, 'We\'re having a moment. Try again shortly.');
}

// Rate limit per IP (fixed window), before anything else touches the DB.
$ip = substr((string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 0, 45);
$window = intdiv(time(), RATE_WINDOW);
$bucket = 'subscribe:' . $ip;
$db->prepare('INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?, ?, 1)
              ON DUPLICATE KEY UPDATE hits = IF(window_start = VALUES(window_start), hits + 1, 1),
                                      window_start = VALUES(window_start)')
   ->execute([$bucket, $window]);
$hits = $db->prepare('SELECT hits FROM rate_limits WHERE bucket = ?');
$hits->execute([$bucket]);
if ((int) $hits->fetchColumn() > RATE_LIMIT) {
    header('Retry-After: ' . RATE_WINDOW);
    respond(429, false, 'Easy, tiger. Try again in a few minutes.');
}
if (random_int(1, 100) === 1) {
    $db->prepare('DELETE FROM rate_limits WHERE window_start < ?')->execute([$window - 2]);
}

// Bot traps: look successful, store nothing.
foreach (HONEYPOT_FIELDS as $field) {
    if (isset($data[$field]) && trim((string) $data[$field]) !== '') {
        respond(200, true, 'You\'re in.');
    }
}
$startedAt = isset($data['started_at']) ? (int) $data['started_at'] : 0;
if ($startedAt > 0 && (time() - $startedAt) < MIN_SUBMIT_SECONDS) {
    respond(200, true, 'You\'re in.');
}

// Validate.
$email = is_string($data['email'] ?? null) ? strtolower(trim($data['email'])) : '';
if ($email === '' || strlen($email) > 254 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
    respond(422, false, 'That email doesn\'t look right.', ['field' => 'email']);
}
if (($data['consent'] ?? false) !== true) {
    respond(422, false, 'Tick the box so we\'re allowed to email you.', ['field' => 'consent']);
}
$flavour = in_array($data['flavour'] ?? null, FLAVOURS, true) ? $data['flavour'] : null;
$source = is_string($data['source'] ?? null) && preg_match('/^[a-z0-9_-]{1,32}$/', $data['source'])
    ? $data['source'] : null;
$ua = isset($_SERVER['HTTP_USER_AGENT']) ? mb_substr((string) $_SERVER['HTTP_USER_AGENT'], 0, 500) : null;

// Store. Signing up again refreshes the consent record and keeps the original created_at.
try {
    $db->prepare('INSERT INTO subscribers (email, flavour, source, consent_text, consented_at, ip_address, user_agent)
                  VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), ?, ?)
                  ON DUPLICATE KEY UPDATE flavour = VALUES(flavour),
                                          source = COALESCE(VALUES(source), source),
                                          consent_text = VALUES(consent_text),
                                          consented_at = VALUES(consented_at),
                                          ip_address = VALUES(ip_address),
                                          user_agent = VALUES(user_agent)')
       ->execute([$email, $flavour, $source, CONSENT_TEXT, $ip, $ua]);
} catch (Throwable $e) {
    error_log('[subscribe] insert failed: ' . $e->getMessage());
    respond(503, false, 'We\'re having a moment. Try again shortly.');
}

// Same answer for new and existing emails, so the form can't be used to test who's signed up.
respond(200, true, 'You\'re in.');
