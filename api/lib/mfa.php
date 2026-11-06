<?php
// Copied from the PowerHER admin (investec powerher/server/lib/mfa.php) for the hopnøsis quiz admin.
// Changes: hq_* helpers, purpose-bound key label, authenticator labels.
// Mandatory two-factor authentication for admins (TOTP, RFC 6238) and step-up re-verification
// for sensitive actions. Modelled on Pulse (ProfileController/AuthController TOTP, DataCipher
// secretbox, otp_used_tokens replay table) with its documented gaps closed:
//  - enforced for every admin (Pulse: opt-in);
//  - replay check fails CLOSED on DB errors (Pulse: fail-open);
//  - backup codes stored as password hashes (Pulse: encrypted);
//  - rate limits on every code-checking endpoint (Pulse: missing on profile 2FA endpoints);
//  - step-up is enforced on the server for the sensitive action itself (Pulse: client-side gate).
declare(strict_types=1);
require_once __DIR__ . '/admin_auth.php';

const TOTP_PERIOD = 30, TOTP_DIGITS = 6, TOTP_WINDOW = 1;
const STEP_UP_SECONDS = 15 * 60;
const BACKUP_CODE_COUNT = 10;

// ---- Secret encryption (libsodium secretbox, purpose-bound key, versioned, fail-closed) ----

function data_key(): string {
    $raw = base64_decode((string)(hq_settings()['data_key'] ?? ''), true);
    if ($raw === false || strlen($raw) !== 32) throw new AdminError('Two-factor sign-in is not configured.', 503);
    return hash_hmac('sha256', 'hopnosis-quiz-mfa-secret-v1', $raw, true);
}
function seal(string $plain): string {
    $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
    return 'sb1:' . base64_encode($nonce . sodium_crypto_secretbox($plain, $nonce, data_key()));
}
function unseal(string $sealed): string {
    if (!str_starts_with($sealed, 'sb1:')) throw new RuntimeException('Unknown secret format.');
    $bin = base64_decode(substr($sealed, 4), true);
    if ($bin === false || strlen($bin) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES) throw new RuntimeException('Corrupt secret.');
    $plain = sodium_crypto_secretbox_open(substr($bin, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), substr($bin, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), data_key());
    if ($plain === false) throw new RuntimeException('Secret failed authentication.');
    return $plain;
}

// ---- TOTP ---------------------------------------------------------------------------------

function base32_encode(string $bin): string {
    $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $bits = ''; $out = '';
    foreach (str_split($bin) as $c) $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
    foreach (str_split($bits, 5) as $chunk) $out .= $alphabet[bindec(str_pad($chunk, 5, '0'))];
    return $out;
}
function totp_at(string $secret, int $step): string {
    $mac = hash_hmac('sha1', pack('J', $step), $secret, true);
    $o = ord($mac[19]) & 0x0f;
    $n = ((ord($mac[$o]) & 0x7f) << 24) | (ord($mac[$o + 1]) << 16) | (ord($mac[$o + 2]) << 8) | ord($mac[$o + 3]);
    return str_pad((string)($n % 10 ** TOTP_DIGITS), TOTP_DIGITS, '0', STR_PAD_LEFT);
}
/** Returns the matched time step, or null. */
function totp_match(string $secret, string $code): ?int {
    if (!preg_match('/^\d{6}$/', $code)) return null;
    $now = intdiv(time(), TOTP_PERIOD);
    for ($d = -TOTP_WINDOW; $d <= TOTP_WINDOW; $d++) if (hash_equals(totp_at($secret, $now + $d), $code)) return $now + $d;
    return null;
}
// Single use: a code (per user, per time step) can be accepted once. Fails closed.
function claim_code(int $userId, string $what): bool {
    $db = hq_db();
    if (random_int(1, 50) === 1) $db->exec('DELETE FROM admin_otp_used WHERE expires_at < UTC_TIMESTAMP()');
    $stmt = $db->prepare('INSERT IGNORE INTO admin_otp_used (key_hash, expires_at) VALUES (?, UTC_TIMESTAMP() + INTERVAL 5 MINUTE)');
    $stmt->execute([hash('sha256', $userId . '|' . $what)]);
    return $stmt->rowCount() === 1;
}

function mfa_row(int $userId): array {
    $stmt = hq_db()->prepare('SELECT id, email, name, role, totp_secret, totp_pending, totp_enabled_at, backup_codes FROM admin_users WHERE id = ?');
    $stmt->execute([$userId]);
    return $stmt->fetch() ?: admin_fail('Account not found.', 404);
}
function mfa_enabled(array $row): bool { return !empty($row['totp_secret']) && !empty($row['totp_enabled_at']); }

// Counts failed codes only (5 per account per 5 minutes, 20 per IP per 15 minutes), so people
// who type the right code are never locked out, while guessing is capped well below the
// ~1-in-333,000 odds per attempt that a 3-step window gives.
function mfa_limits(array $user): array { return ['admin_mfa_user:' . $user['id'] => [5, 300], 'admin_mfa_ip:' . client_ip() => [20, 900]]; }
function mfa_throttle(array $user): void {
    foreach (mfa_limits($user) as $name => [$max]) {
        $st = limiter_state($name);
        if ($st['hits'] >= $max) admin_fail('Too many code attempts. Wait a few minutes and try again.', 429, ['retry_after_seconds' => $st['retry']]);
    }
}
function mfa_failed(array $user, string $event, string $message): never {
    foreach (mfa_limits($user) as $name => [, $window]) limiter_hit($name, $window);
    audit($user, $event);
    admin_fail($message, 422); // 422, not 401: the session is still valid, only the code was wrong
}

/** Checks a TOTP code or a backup code for $user. Consumes it on success. */
function verify_second_factor(array $user, $codeInput): string {
    mfa_throttle($user);
    $row = mfa_row($user['id']);
    if (!mfa_enabled($row)) admin_fail('Two-factor sign-in is not set up yet.', 409);
    $code = strtoupper(preg_replace('/[\s-]/', '', is_string($codeInput) ? $codeInput : ''));
    if (preg_match('/^\d{6}$/', $code)) {
        $step = totp_match(unseal($row['totp_secret']), $code);
        if ($step !== null && claim_code($user['id'], "totp:$step")) return 'totp';
    } elseif (preg_match('/^[A-Z2-9]{8}$/', $code)) {
        $codes = json_decode((string)$row['backup_codes'], true) ?: [];
        foreach ($codes as $i => $hash) {
            if (password_verify($code, $hash)) {
                unset($codes[$i]);
                hq_db()->prepare('UPDATE admin_users SET backup_codes = ? WHERE id = ?')->execute([json_encode(array_values($codes)), $user['id']]);
                audit($user, 'mfa.backup_code_used', count($codes) . ' left');
                return 'backup';
            }
        }
    }
    mfa_failed($user, 'mfa.failed', 'That code didn’t work. Check the time on your phone and try the newest code.');
}

function new_backup_codes(int $userId): array {
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $plain = []; $hashes = [];
    for ($i = 0; $i < BACKUP_CODE_COUNT; $i++) {
        $c = ''; for ($j = 0; $j < 8; $j++) $c .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        $plain[] = substr($c, 0, 4) . '-' . substr($c, 4);
        $hashes[] = password_hash($c, PASSWORD_DEFAULT);
    }
    hq_db()->prepare('UPDATE admin_users SET backup_codes = ? WHERE id = ?')->execute([json_encode($hashes), $userId]);
    return $plain;
}

// ---- Session state ---------------------------------------------------------------------------

function mark_session(array $user, bool $mfaOk, bool $stepUp): void {
    hq_db()->prepare('UPDATE admin_sessions SET mfa_ok = ?, stepup_at = ' . ($stepUp ? 'UTC_TIMESTAMP()' : 'stepup_at') . ' WHERE token_hash = ?')
        ->execute([$mfaOk ? 1 : 0, $user['session']]);
}
function mfa_state(array $who): string {
    if (!empty($who['mfaOk'])) return 'ok';
    return mfa_enabled(mfa_row($who['id'])) ? 'verify' : 'setup';
}
// Second factor passed: swap the challenge for a real session (the only place one is created).
function complete_sign_in(array $c): array {
    end_challenge($c);
    $session = start_session($c);
    return ['user' => public_user($c), 'csrf' => $session['csrf']];
}
function require_step_up(array $user): void {
    $at = $user['stepUpAt'] ?? null;
    if (!$at || strtotime($at . ' UTC') + STEP_UP_SECONDS < time()) throw new AdminError('Confirm it’s you: enter a code from your authenticator app.', 403, ['stepUp' => true]);
}

// ---- Endpoints -------------------------------------------------------------------------------

function mfa_setup(array $user): array {
    $row = mfa_row($user['id']);
    if (mfa_enabled($row)) admin_fail('Two-factor sign-in is already set up.', 409);
    $secret = random_bytes(20);
    hq_db()->prepare('UPDATE admin_users SET totp_pending = ? WHERE id = ?')->execute([seal($secret), $user['id']]);
    $b32 = base32_encode($secret);
    $label = rawurlencode('hopnøsis admin:' . $row['email']);
    return ['secret' => trim(chunk_split($b32, 4, ' ')), 'otpauth' => "otpauth://totp/$label?secret=$b32&issuer=" . rawurlencode('hopnøsis admin') . '&algorithm=SHA1&digits=6&period=30'];
}

// $user here is the pending challenge (password checked, no session yet).
function mfa_enable(array $user, $codeInput): array {
    mfa_throttle($user);
    $row = mfa_row($user['id']);
    if (mfa_enabled($row)) admin_fail('Two-factor sign-in is already set up.', 409);
    if (empty($row['totp_pending'])) admin_fail('Start the set-up again.', 409);
    $secret = unseal($row['totp_pending']);
    $step = totp_match($secret, is_string($codeInput) ? preg_replace('/\s/', '', $codeInput) : '');
    if ($step === null || !claim_code($user['id'], "totp:$step")) mfa_failed($user, 'mfa.setup_failed', 'That code didn’t work. Check the time on your phone and try the newest code.');
    hq_db()->prepare('UPDATE admin_users SET totp_secret = totp_pending, totp_pending = NULL, totp_enabled_at = UTC_TIMESTAMP() WHERE id = ?')->execute([$user['id']]);
    $codes = new_backup_codes($user['id']);
    revoke_user_sessions($user['id']);   // nothing older survives a fresh 2FA enrolment
    audit($user, 'mfa.enabled');
    return ['ok' => true, 'backupCodes' => $codes] + complete_sign_in($user);
}

function mfa_verify_login(array $user, $code): array {
    $how = verify_second_factor($user, $code);
    audit($user, 'login.mfa_ok', $how);
    return ['ok' => true, 'method' => $how] + complete_sign_in($user);
}

function step_up(array $user, $code): array {
    $how = verify_second_factor($user, $code);
    mark_session($user, true, true);
    audit($user, 'mfa.step_up', $how);
    return ['ok' => true, 'validForMinutes' => intdiv(STEP_UP_SECONDS, 60)];
}

function regenerate_backup_codes(array $user): array {
    require_step_up($user);
    if (!mfa_enabled(mfa_row($user['id']))) admin_fail('Two-factor sign-in is not set up yet.', 409);
    $codes = new_backup_codes($user['id']);
    audit($user, 'mfa.backup_codes_regenerated');
    return ['backupCodes' => $codes];
}

function mfa_status(array $user): array {
    $row = mfa_row($user['id']);
    return ['enabled' => mfa_enabled($row), 'enabledAt' => $row['totp_enabled_at'] ? $row['totp_enabled_at'] . 'Z' : null,
        'backupCodesLeft' => count(json_decode((string)$row['backup_codes'], true) ?: [])];
}

// Owner resets another person's 2FA (lost phone): they must set it up again on next sign-in.
function reset_user_mfa(array $owner, $id): array {
    require_owner($owner);
    require_step_up($owner);
    $target = load_user((int)$id);
    if ((int)$target['id'] === $owner['id']) admin_fail('Use your own backup codes, or ask another owner.', 409);
    hq_db()->prepare('UPDATE admin_users SET totp_secret = NULL, totp_pending = NULL, totp_enabled_at = NULL, backup_codes = NULL WHERE id = ?')->execute([$target['id']]);
    revoke_user_sessions((int)$target['id']);
    audit($owner, 'mfa.reset', $target['email']);
    return ['ok' => true];
}
