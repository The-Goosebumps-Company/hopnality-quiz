<?php
// POST api/subscribe.php: "Join the Hopnotised" email sign-up on the result screen.
// Modelled on Pulse's public contact form (ContactController + PublicFormGuard + RateLimiter):
// honeypot and minimum-submit-time traps that answer bots with a fake success, a per-IP rate
// limit, strict validation, and the same {success, message, data} JSON shape.
// No CAPTCHA (event crowd on phones) and no email per sign-up (exported instead).
// Kept separate from the anonymous research answers in `results` (the brief: separate opt-in).
declare(strict_types=1);
require __DIR__ . '/lib.php';

const CONSENT_TEXT = 'Yes, hopnøsis can email me. Unsubscribe anytime.'; // must match index.html
const HONEYPOT_FIELDS = ['website', 'company_website', 'fax_number', '_gotcha', 'url'];
const MIN_SUBMIT_SECONDS = 2;

$data = read_json_post();
$db = db();
// Generous because a whole venue on one Wi-Fi network shares an IP.
rate_limit($db, 'subscribe', 40, 300);

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
$source = source_param($data['source'] ?? null);
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
       ->execute([$email, $flavour, $source, CONSENT_TEXT, client_ip(), $ua]);
} catch (Throwable $e) {
    error_log('[subscribe] insert failed: ' . $e->getMessage());
    respond(503, false, 'We\'re having a moment. Try again shortly.');
}

// Same answer for new and existing emails, so the form can't be used to test who's signed up.
respond(200, true, 'You\'re in.');
