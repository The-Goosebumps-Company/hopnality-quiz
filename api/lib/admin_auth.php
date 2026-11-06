<?php
// Copied from the PowerHER admin (investec powerher/server/lib/admin_auth.php) for the hopnøsis quiz admin.
// Changes: hq_db/hq_settings, own cookie names, admin_rate_limits table, hopnøsis common passwords.
// Admin authentication: invite-only accounts, email + password, server-side sessions.
// Mirrors the Pulse AuthController rules: password_hash/verify with rehash, a
// dummy verify for unknown emails (no timing-based user enumeration), one generic
// "Invalid email or password" message, lockout after 5 failures per account or
// 20 per IP in 15 minutes, the same password policy (8+ chars, upper, lower,
// number, not common, not in Have I Been Pwned via k-anonymity), one-time links
// stored as SHA-256 with 1-hour (reset) / 7-day (invite) expiry, and all sessions
// revoked after a password reset. No email is sent: the owner shares the links.
declare(strict_types=1);
require_once __DIR__ . '/core.php';

final class AdminError extends RuntimeException {
    public function __construct(string $message, public int $status = 400, public array $extra = []) { parent::__construct($message); }
}

const ADMIN_IDLE_SECONDS = 2 * 3600;        // sign out after 2 hours of inactivity
const ADMIN_ABSOLUTE_SECONDS = 12 * 3600;   // and always after 12 hours
// __Host- prefix (HTTPS only): browsers accept it only with Secure, Path=/ and no Domain,
// so no other subdomain can set or overwrite the admin session cookie.
function admin_cookie(): string { return is_https() ? '__Host-hq_admin' : 'hq_admin'; }
const LOGIN_ACCOUNT_MAX = 5, LOGIN_IP_MAX = 20, LOGIN_WINDOW = 900;
const INVITE_TTL = 7 * 86400, RESET_TTL = 3600;

function admin_fail(string $message, int $status = 400, array $extra = []): never { throw new AdminError($message, $status, $extra); }
function client_ip(): string { return substr((string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 0, 45); }
function utc_in(int $seconds): string { return gmdate('Y-m-d H:i:s', time() + $seconds); }
function normalize_email($email): string {
    $email = strtolower(trim(is_string($email) ? $email : ''));
    return (strlen($email) <= 255 && filter_var($email, FILTER_VALIDATE_EMAIL)) ? $email : '';
}

function audit(?array $user, string $action, string $detail = ''): void {
    hq_db()->prepare('INSERT INTO admin_audit (user_id, email, action, detail, ip) VALUES (?,?,?,?,?)')
        ->execute([$user['id'] ?? null, $user['email'] ?? '', $action, mb_substr($detail, 0, 500), client_ip()]);
}

// ---- Rate limiting (admin_rate_limits table: fixed windows; the quiz's own rate_limits table has another shape) ----------------------

function limiter_state(string $name): array {
    $stmt = hq_db()->prepare('SELECT hits, expires_at FROM admin_rate_limits WHERE name = ?');
    $stmt->execute([$name]);
    $row = $stmt->fetch();
    if (!$row || (int)$row['expires_at'] <= time()) return ['hits' => 0, 'retry' => 0];
    return ['hits' => (int)$row['hits'], 'retry' => (int)$row['expires_at'] - time()];
}
function limiter_hit(string $name, int $window): int {
    $now = time();
    hq_db()->prepare('INSERT INTO admin_rate_limits (name, hits, expires_at) VALUES (?, 1, ?)
        ON DUPLICATE KEY UPDATE hits = IF(expires_at <= ?, 1, hits + 1), expires_at = IF(expires_at <= ?, VALUES(expires_at), expires_at)')
        ->execute([$name, $now + $window, $now, $now]);
    return limiter_state($name)['hits'];
}
function limiter_clear(string $name): void { hq_db()->prepare('DELETE FROM admin_rate_limits WHERE name = ?')->execute([$name]); }

function login_keys(string $email): array { return ['admin_login_ip:' . client_ip(), 'admin_login_acct:' . sha1($email)]; }
function login_lock_retry(string $email): int {
    [$ipKey, $acctKey] = login_keys($email);
    $acct = limiter_state($acctKey); $ip = limiter_state($ipKey);
    $retry = 0;
    if ($acct['hits'] >= LOGIN_ACCOUNT_MAX) $retry = max($retry, $acct['retry']);
    if ($ip['hits'] >= LOGIN_IP_MAX) $retry = max($retry, $ip['retry']);
    return $retry;
}
function record_login_failure(string $email): void {
    [$ipKey, $acctKey] = login_keys($email);
    limiter_hit($ipKey, LOGIN_WINDOW);
    limiter_hit($acctKey, LOGIN_WINDOW);
}
function throttle(string $name, int $max, int $window, string $message): void {
    if (limiter_hit($name, $window) > $max) admin_fail($message, 429, ['retry_after_seconds' => limiter_state($name)['retry']]);
}

// ---- Password policy (same rules as Pulse) ----------------------------------------

function password_policy_error(string $password): ?string {
    if (strlen($password) < 8 || strlen($password) > 255 || !preg_match('/[A-Z]/', $password) || !preg_match('/[a-z]/', $password) || !preg_match('/[0-9]/', $password)) {
        return 'Password must be at least 8 characters and include uppercase, lowercase, and a number.';
    }
    $common = ['password1', 'password123', 'password123!', 'admin123', 'admin123!', 'welcome123', 'welcome123!', 'qwerty123', 'qwerty123!',
        'letmein123', 'letmein123!', 'hopnosis123', 'hopnosis1', 'hopnosisaf', 'gandg123'];
    if (in_array(strtolower(trim($password)), $common, true) || password_is_breached($password)) {
        return 'Choose a different password. This one is known to be compromised or too common.';
    }
    return null;
}
// Have I Been Pwned range API: only the first 5 hex chars of the SHA-1 leave the server.
function password_is_breached(string $password): bool {
    if ((hq_settings()['password_breach_check'] ?? true) === false) return false;
    $sha1 = strtoupper(sha1($password));
    $context = stream_context_create(['http' => ['method' => 'GET', 'timeout' => 2, 'header' => "User-Agent: hopnosis-quiz-admin-password-policy\r\nAdd-Padding: true\r\n"]]);
    $range = @file_get_contents('https://api.pwnedpasswords.com/range/' . substr($sha1, 0, 5), false, $context);
    if (!is_string($range)) { error_log('PASSWORD_BREACH_CHECK_UNAVAILABLE'); return false; }
    foreach (preg_split('/\r\n|\r|\n/', $range) as $line) {
        [$candidate, $count] = array_pad(explode(':', $line, 2), 2, '0');
        if ((int)$count > 0 && hash_equals(substr($sha1, 5), strtoupper(trim($candidate)))) return true;
    }
    return false;
}

// ---- Sessions ---------------------------------------------------------------------

function is_https(): bool { return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['SERVER_PORT'] ?? '') === '443'; }
function set_session_cookie(string $value, int $expires): void {
    setcookie(admin_cookie(), $value, ['expires' => $expires, 'path' => '/', 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Strict']);
}

// Only called once BOTH factors have succeeded (see mfa.php). A password alone never gets here.
function start_session(array $user): array {
    $token = bin2hex(random_bytes(32));
    $csrf = bin2hex(random_bytes(32));
    $db = hq_db();
    $db->prepare('INSERT INTO admin_sessions (token_hash, user_id, csrf_token, expires_at, ip, user_agent, mfa_ok, stepup_at) VALUES (?,?,?,?,?,?,1,UTC_TIMESTAMP())')
       ->execute([hash('sha256', $token), $user['id'], $csrf, utc_in(ADMIN_ABSOLUTE_SECONDS), client_ip(),
           substr(preg_replace('/[^\x20-\x7E]/', '', (string)($_SERVER['HTTP_USER_AGENT'] ?? '')), 0, 255)]);
    $db->prepare('UPDATE admin_users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?')->execute([$user['id']]);
    if (random_int(1, 20) === 1) $db->exec('DELETE FROM admin_sessions WHERE expires_at < UTC_TIMESTAMP() OR last_seen_at < UTC_TIMESTAMP() - INTERVAL ' . ADMIN_IDLE_SECONDS . ' SECOND');
    set_session_cookie($token, time() + ADMIN_ABSOLUTE_SECONDS);
    return ['csrf' => $csrf];
}

// Returns the signed-in user (with 'csrf') or null. Enforces idle and absolute expiry.
// Background requests (live polling, automatic refreshes) pass $touch = false so an
// unattended open tab still signs out after the idle limit.
function current_admin(bool $touch = true): ?array {
    $token = $_COOKIE[admin_cookie()] ?? '';
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)) return null;
    $hash = hash('sha256', $token);
    $stmt = hq_db()->prepare('SELECT s.csrf_token, s.last_seen_at, s.expires_at, s.mfa_ok, s.stepup_at, u.id, u.email, u.name, u.role, u.status
        FROM admin_sessions s JOIN admin_users u ON u.id = s.user_id WHERE s.token_hash = ?');
    $stmt->execute([$hash]);
    $row = $stmt->fetch();
    $now = time();
    if (!$row || $row['status'] !== 'active' || strtotime($row['expires_at'] . ' UTC') <= $now || strtotime($row['last_seen_at'] . ' UTC') + ADMIN_IDLE_SECONDS <= $now) {
        if ($row) hq_db()->prepare('DELETE FROM admin_sessions WHERE token_hash = ?')->execute([$hash]);
        return null;
    }
    if ($touch && strtotime($row['last_seen_at'] . ' UTC') + 60 < $now) {
        hq_db()->prepare('UPDATE admin_sessions SET last_seen_at = UTC_TIMESTAMP() WHERE token_hash = ?')->execute([$hash]);
    }
    return ['id' => (int)$row['id'], 'email' => $row['email'], 'name' => $row['name'], 'role' => $row['role'], 'csrf' => $row['csrf_token'], 'session' => $hash,
        'mfaOk' => (bool)$row['mfa_ok'], 'stepUpAt' => $row['stepup_at'],
        'idleExpiresAt' => gmdate('Y-m-d\\TH:i:s\\Z', ($touch ? $now : strtotime($row['last_seen_at'] . ' UTC')) + ADMIN_IDLE_SECONDS)];
}

function end_session(?array $user): void {
    if ($user) {
        hq_db()->prepare('DELETE FROM admin_sessions WHERE token_hash = ?')->execute([$user['session']]);
        ws_notify(['event' => 'session:revoke', 'sid' => ws_session_id($user['session'])]);
    }
    set_session_cookie('', time() - 3600);
}
function revoke_user_sessions(int $userId): void {
    hq_db()->prepare('DELETE FROM admin_sessions WHERE user_id = ?')->execute([$userId]);
    hq_db()->prepare('DELETE FROM admin_mfa_challenges WHERE user_id = ?')->execute([$userId]);
    ws_notify(['event' => 'session:revoke', 'to' => $userId]);
}

// ---- Two-factor challenge (between password and session) ---------------------------
// Own cookie, own CSRF token, 10 minutes, one per user. It can only reach the 2FA actions.
const MFA_CHALLENGE_SECONDS = 600;
function challenge_cookie(): string { return is_https() ? '__Host-hq_mfa' : 'hq_mfa'; }
function set_challenge_cookie(string $value, int $expires): void {
    setcookie(challenge_cookie(), $value, ['expires' => $expires, 'path' => '/', 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Strict']);
}
function start_challenge(array $user, string $purpose): array {
    $token = bin2hex(random_bytes(32));
    $csrf = bin2hex(random_bytes(32));
    $db = hq_db();
    $db->prepare('DELETE FROM admin_mfa_challenges WHERE user_id = ? OR expires_at < UTC_TIMESTAMP()')->execute([$user['id']]);
    $db->prepare('INSERT INTO admin_mfa_challenges (token_hash, user_id, csrf_token, purpose, expires_at, ip) VALUES (?,?,?,?,?,?)')
       ->execute([hash('sha256', $token), $user['id'], $csrf, $purpose, utc_in(MFA_CHALLENGE_SECONDS), client_ip()]);
    set_challenge_cookie($token, time() + MFA_CHALLENGE_SECONDS);
    return ['csrf' => $csrf];
}
function current_challenge(): ?array {
    $token = $_COOKIE[challenge_cookie()] ?? '';
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)) return null;
    $hash = hash('sha256', $token);
    $stmt = hq_db()->prepare('SELECT c.csrf_token, c.purpose, c.expires_at, u.id, u.email, u.name, u.role, u.status
        FROM admin_mfa_challenges c JOIN admin_users u ON u.id = c.user_id WHERE c.token_hash = ?');
    $stmt->execute([$hash]);
    $row = $stmt->fetch();
    if (!$row || $row['status'] !== 'active' || strtotime($row['expires_at'] . ' UTC') <= time()) {
        if ($row) hq_db()->prepare('DELETE FROM admin_mfa_challenges WHERE token_hash = ?')->execute([$hash]);
        return null;
    }
    return ['id' => (int)$row['id'], 'email' => $row['email'], 'name' => $row['name'], 'role' => $row['role'],
        'csrf' => $row['csrf_token'], 'challenge' => $hash, 'purpose' => $row['purpose']];
}
function end_challenge(?array $c): void {
    if ($c) hq_db()->prepare('DELETE FROM admin_mfa_challenges WHERE token_hash = ?')->execute([$c['challenge']]);
    set_challenge_cookie('', time() - 3600);
}
function pending_user(array $c): array { return ['email' => $c['email'], 'name' => $c['name']]; }

function public_user(array $u): array { return ['id' => (int)$u['id'], 'email' => $u['email'], 'name' => $u['name'], 'role' => $u['role']]; }

// ---- Login ------------------------------------------------------------------------

function admin_login($emailInput, $password): array {
    $email = normalize_email($emailInput);
    $password = is_string($password) ? $password : '';
    if ($email === '' || $password === '' || strlen($password) > 255) admin_fail('Enter your email and password.', 422);
    $retry = login_lock_retry($email);
    if ($retry > 0) {
        audit(['email' => $email], 'login.locked');
        admin_fail('Too many sign-in attempts. Please try again later.', 429, ['retry_after_seconds' => $retry]);
    }
    $stmt = hq_db()->prepare('SELECT * FROM admin_users WHERE email = ?');
    $stmt->execute([$email]);
    $user = $stmt->fetch();
    // Always run one password_verify so unknown emails take the same time.
    $hash = ($user['password_hash'] ?? '') ?: password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT);
    $ok = password_verify($password, $hash) && $user && $user['status'] === 'active' && $user['password_hash'] !== '';
    if (!$ok) {
        record_login_failure($email);
        audit($user ? ['id' => (int)$user['id'], 'email' => $email] : ['email' => $email], 'login.failed');
        $retry = login_lock_retry($email);
        if ($retry > 0) admin_fail('Too many sign-in attempts. Please try again later.', 429, ['retry_after_seconds' => $retry]);
        admin_fail('Invalid email or password.', 401);
    }
    if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
        hq_db()->prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $user['id']]);
    }
    limiter_clear(login_keys($email)[1]);
    // Password OK is only half of signing in: no session yet, just a 2FA challenge.
    $mfa = !empty($user['totp_secret']) && !empty($user['totp_enabled_at']) ? 'verify' : 'setup';
    $challenge = start_challenge($user, $mfa);
    audit($user, 'login.password_ok');
    return ['user' => null, 'mfa' => $mfa, 'pending' => ['email' => $user['email'], 'name' => $user['name']], 'csrf' => $challenge['csrf']];
}

// ---- One-time links (invite / reset) ------------------------------------------------

function create_link(string $purpose, string $email, string $role, ?int $userId, ?int $createdBy): string {
    $token = bin2hex(random_bytes(32));
    $db = hq_db();
    // Only the newest link of each kind per email stays valid.
    $db->prepare('UPDATE admin_tokens SET used_at = UTC_TIMESTAMP() WHERE email = ? AND purpose = ? AND used_at IS NULL')->execute([$email, $purpose]);
    $db->prepare('INSERT INTO admin_tokens (purpose, token_hash, email, role, user_id, created_by, expires_at) VALUES (?,?,?,?,?,?,?)')
       ->execute([$purpose, hash('sha256', $token), $email, $role, $userId, $createdBy, utc_in($purpose === 'invite' ? INVITE_TTL : RESET_TTL)]);
    $base = rtrim(hq_settings()['app_url'] ?? '', '/');
    return $base . '/admin/#/' . ($purpose === 'invite' ? 'accept-invite' : 'reset-password') . '?token=' . $token;
}

function find_link($token, string $purpose): array {
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)) admin_fail('This link is invalid or has expired.', 400);
    $stmt = hq_db()->prepare('SELECT * FROM admin_tokens WHERE token_hash = ? AND purpose = ?');
    $stmt->execute([hash('sha256', $token), $purpose]);
    $link = $stmt->fetch();
    if (!$link || $link['used_at'] !== null || strtotime($link['expires_at'] . ' UTC') <= time()) admin_fail('This link is invalid or has expired.', 400);
    return $link;
}

function link_info($token, string $purpose): array {
    throttle('admin_link_ip:' . client_ip(), 30, 900, 'Too many attempts. Please try again later.');
    $link = find_link($token, $purpose);
    return ['email' => $link['email'], 'role' => $link['role'], 'expiresAt' => $link['expires_at'] . 'Z'];
}

function accept_invite($token, $name, $password): array {
    throttle('admin_link_ip:' . client_ip(), 30, 900, 'Too many attempts. Please try again later.');
    $link = find_link($token, 'invite');
    $name = trim(is_string($name) ? $name : '');
    if ($name === '' || mb_strlen($name) > 120) admin_fail('Enter your name.', 422);
    $error = password_policy_error(is_string($password) ? $password : '');
    if ($error) admin_fail($error, 422);
    $db = hq_db();
    $db->beginTransaction();
    try {
        $db->prepare('UPDATE admin_tokens SET used_at = UTC_TIMESTAMP() WHERE id = ? AND used_at IS NULL')->execute([$link['id']]);
        $existing = $db->prepare('SELECT id FROM admin_users WHERE email = ?');
        $existing->execute([$link['email']]);
        if ($existing->fetchColumn() !== false) admin_fail('An account with this email already exists. Sign in instead.', 409);
        $db->prepare('INSERT INTO admin_users (email, name, password_hash, role) VALUES (?,?,?,?)')
           ->execute([$link['email'], $name, password_hash($password, PASSWORD_DEFAULT), $link['role']]);
        $id = (int)$db->lastInsertId();
        $db->commit();
    } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
    $user = ['id' => $id, 'email' => $link['email'], 'name' => $name, 'role' => $link['role']];
    audit($user, 'invite.accepted');
    $challenge = start_challenge($user, 'setup');   // set up 2FA before any session exists
    return ['user' => null, 'mfa' => 'setup', 'pending' => ['email' => $user['email'], 'name' => $name], 'csrf' => $challenge['csrf']];
}

function reset_with_link($token, $password): array {
    throttle('admin_link_ip:' . client_ip(), 30, 900, 'Too many attempts. Please try again later.');
    $link = find_link($token, 'reset');
    $error = password_policy_error(is_string($password) ? $password : '');
    if ($error) admin_fail($error, 422);
    $db = hq_db();
    $db->prepare('UPDATE admin_tokens SET used_at = UTC_TIMESTAMP() WHERE id = ?')->execute([$link['id']]);
    $db->prepare("UPDATE admin_users SET password_hash = ? WHERE id = ? AND status = 'active'")->execute([password_hash($password, PASSWORD_DEFAULT), $link['user_id']]);
    revoke_user_sessions((int)$link['user_id']);
    limiter_clear(login_keys($link['email'])[1]);
    audit(['id' => (int)$link['user_id'], 'email' => $link['email']], 'password.reset');
    return ['ok' => true];
}

function change_password(array $user, $current, $new): array {
    $stmt = hq_db()->prepare('SELECT password_hash FROM admin_users WHERE id = ?');
    $stmt->execute([$user['id']]);
    if (!is_string($current) || !password_verify($current, (string)$stmt->fetchColumn())) {
        throttle('admin_pw_change:' . $user['id'], 5, 900, 'Too many attempts. Please try again later.');
        admin_fail('Your current password is incorrect.', 422);
    }
    $error = password_policy_error(is_string($new) ? $new : '');
    if ($error) admin_fail($error, 422);
    hq_db()->prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?')->execute([password_hash($new, PASSWORD_DEFAULT), $user['id']]);
    hq_db()->prepare('DELETE FROM admin_sessions WHERE user_id = ? AND token_hash <> ?')->execute([$user['id'], $user['session']]);
    ws_notify(['event' => 'session:revoke', 'to' => $user['id']]); // other tabs reconnect only if still signed in
    audit($user, 'password.changed');
    return ['ok' => true];
}

// ---- User management (owner only) ------------------------------------------------

function require_owner(array $user): void { if ($user['role'] !== 'owner') admin_fail('Only owners can manage team access.', 403); }

function list_team(): array {
    $users = hq_db()->query('SELECT id, email, name, role, status, created_at, last_login_at, totp_enabled_at FROM admin_users ORDER BY created_at')->fetchAll();
    $invites = hq_db()->query("SELECT id, email, role, created_at, expires_at FROM admin_tokens WHERE purpose = 'invite' AND used_at IS NULL AND expires_at > UTC_TIMESTAMP() ORDER BY created_at DESC")->fetchAll();
    $z = fn($v) => $v ? $v . 'Z' : null;
    return [
        'users' => array_map(fn($u) => ['id' => (int)$u['id'], 'email' => $u['email'], 'name' => $u['name'], 'role' => $u['role'], 'status' => $u['status'], 'createdAt' => $z($u['created_at']), 'lastLoginAt' => $z($u['last_login_at']), 'mfa' => !empty($u['totp_enabled_at'])], $users),
        'invites' => array_map(fn($i) => ['id' => (int)$i['id'], 'email' => $i['email'], 'role' => $i['role'], 'createdAt' => $z($i['created_at']), 'expiresAt' => $z($i['expires_at'])], $invites),
    ];
}

function invite_user(array $owner, $emailInput, $role): array {
    $email = normalize_email($emailInput);
    if ($email === '') admin_fail('Enter a valid email address.', 422);
    if (!in_array($role, ['owner', 'admin'], true)) admin_fail('Choose a role.', 422);
    $stmt = hq_db()->prepare('SELECT id FROM admin_users WHERE email = ?');
    $stmt->execute([$email]);
    if ($stmt->fetchColumn() !== false) admin_fail('That person already has an account.', 409);
    $link = create_link('invite', $email, $role, null, $owner['id']);
    audit($owner, 'invite.created', "$email as $role");
    return ['link' => $link, 'expiresInDays' => intdiv(INVITE_TTL, 86400)];
}

function revoke_invite(array $owner, $id): array {
    $stmt = hq_db()->prepare("UPDATE admin_tokens SET used_at = UTC_TIMESTAMP() WHERE id = ? AND purpose = 'invite' AND used_at IS NULL");
    $stmt->execute([(int)$id]);
    audit($owner, 'invite.revoked', (string)(int)$id);
    return ['ok' => true];
}

function load_user(int $id): array {
    $stmt = hq_db()->prepare('SELECT * FROM admin_users WHERE id = ?');
    $stmt->execute([$id]);
    return $stmt->fetch() ?: admin_fail('User not found.', 404);
}
function active_owner_count(): int { return (int)hq_db()->query("SELECT COUNT(*) FROM admin_users WHERE role = 'owner' AND status = 'active'")->fetchColumn(); }

function update_user(array $owner, $id, $changes): array {
    $target = load_user((int)$id);
    $role = $changes->role ?? $target['role'];
    $status = $changes->status ?? $target['status'];
    if (!in_array($role, ['owner', 'admin'], true) || !in_array($status, ['active', 'disabled'], true)) admin_fail('Invalid change.', 422);
    $losesOwner = $target['role'] === 'owner' && $target['status'] === 'active' && ($role !== 'owner' || $status !== 'active');
    if ($losesOwner && active_owner_count() <= 1) admin_fail('There must always be at least one active owner.', 409);
    hq_db()->prepare('UPDATE admin_users SET role = ?, status = ? WHERE id = ?')->execute([$role, $status, $target['id']]);
    if ($status === 'disabled') revoke_user_sessions((int)$target['id']);
    elseif ($role !== $target['role']) ws_notify(['event' => 'session:revoke', 'to' => (int)$target['id']]);
    audit($owner, 'user.updated', "{$target['email']}: role=$role status=$status");
    return ['ok' => true];
}

function create_reset_link(array $owner, $id): array {
    $target = load_user((int)$id);
    if ($target['status'] !== 'active') admin_fail('Re-enable this account first.', 409);
    $link = create_link('reset', $target['email'], $target['role'], (int)$target['id'], $owner['id']);
    audit($owner, 'reset.created', $target['email']);
    return ['link' => $link, 'expiresInMinutes' => intdiv(RESET_TTL, 60)];
}
