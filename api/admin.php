<?php
// Admin JSON API for the hopnøsis quiz: /api/admin.php?action=<name>.
// Ported from PowerHER's public/admin-api.php: the same sign-in flow (password → 2FA challenge →
// session), CSRF on every change, step-up 2FA for exports and team changes, and an audit log.
// Session cookie + CSRF header are required for everything except sign-in and the one-time links.
declare(strict_types=1);
require __DIR__ . '/lib/admin_auth.php';
require __DIR__ . '/lib/mfa.php';
require __DIR__ . '/lib/admin_data.php';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');

function respond(int $status, array $body): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$action = (string)($_GET['action'] ?? '');
$method = $_SERVER['REQUEST_METHOD'];
$input = new stdClass();
if ($method === 'POST') {
    if (!str_starts_with((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) respond(415, ['error' => 'Unsupported request.']);
    $raw = file_get_contents('php://input', false, null, 0, 20000);
    $input = json_decode($raw ?: '{}', false, 8);
    if (!is_object($input)) respond(400, ['error' => 'Invalid request.']);
}
$in = fn(string $k) => property_exists($input, $k) ? $input->$k : null;

try {
    // ---- Public actions ----
    $public = [
        'login' => ['POST', fn() => admin_login($in('email'), $in('password'))],
        'invite-info' => ['GET', fn() => link_info($_GET['token'] ?? '', 'invite')],
        'accept-invite' => ['POST', fn() => accept_invite($in('token'), $in('name'), $in('password'))],
        'reset-info' => ['GET', fn() => link_info($_GET['token'] ?? '', 'reset')],
        'reset-password' => ['POST', fn() => reset_with_link($in('token'), $in('password'))],
    ];
    if (isset($public[$action])) {
        [$want, $handler] = $public[$action];
        if ($method !== $want) respond(405, ['error' => 'Method not allowed.']);
        respond(200, $handler());
    }

    // ---- Second step of signing in: a password-verified CHALLENGE, not a session ----
    $challengeActions = [
        'mfa-setup' => fn($c) => mfa_setup($c),
        'mfa-enable' => fn($c) => mfa_enable($c, $in('code')),
        'mfa-verify' => fn($c) => mfa_verify_login($c, $in('code')),
        'mfa-cancel' => function ($c) { audit($c, 'login.cancelled'); end_challenge($c); return ['ok' => true]; },
    ];
    if (isset($challengeActions[$action])) {
        if ($method !== 'POST') respond(405, ['error' => 'Method not allowed.']);
        $challenge = current_challenge();
        if (!$challenge) { end_challenge(null); respond(401, ['error' => 'Your sign-in timed out. Enter your password again.', 'restart' => true]); }
        if (!hash_equals($challenge['csrf'], (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) respond(403, ['error' => 'Your sign-in expired. Reload the page.']);
        respond(200, $challengeActions[$action]($challenge));
    }

    // Live polling sends X-Background: 1 so it doesn't count as activity.
    $user = current_admin(($_SERVER['HTTP_X_BACKGROUND'] ?? '') !== '1');
    if ($user && empty($user['mfaOk'])) { end_session($user); $user = null; }
    if ($action === 'me') {
        if ($user) respond(200, ['user' => public_user($user), 'csrf' => $user['csrf'], 'idleExpiresAt' => $user['idleExpiresAt'], 'mfa' => 'ok']);
        $challenge = current_challenge();
        respond(200, $challenge ? ['user' => null, 'mfa' => mfa_state($challenge), 'pending' => pending_user($challenge), 'csrf' => $challenge['csrf']] : ['user' => null]);
    }
    if (!$user) respond(401, ['error' => 'Please sign in.']);
    if ($method === 'POST' && !hash_equals($user['csrf'], (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) respond(403, ['error' => 'Your session expired. Reload the page.']);

    $get = [
        'pulse' => fn() => pulse() + ['idleExpiresAt' => $user['idleExpiresAt']],
        'filters' => fn() => filters(),
        'overview' => fn() => overview($_GET),
        'insights' => fn() => insights($_GET),
        'signups' => function () use ($user) {
            $d = signups($_GET);
            if (($_SERVER['HTTP_X_BACKGROUND'] ?? '') !== '1') audit($user, 'signups.viewed', 'page ' . $d['page']);
            return $d;
        },
        'team' => function () use ($user) { require_owner($user); return list_team(); },
        'mfa-status' => fn() => mfa_status($user),
        'step-up-status' => fn() => ['active' => !empty($user['stepUpAt']) && strtotime($user['stepUpAt'] . ' UTC') + STEP_UP_SECONDS > time()],
        'audit' => function () use ($user) { require_owner($user); return audit_log($_GET); },
    ];
    if ($action === 'export') {
        if ($method !== 'GET') respond(405, ['error' => 'Method not allowed.']);
        // Downloads are plain links, so they carry the CSRF token as a query parameter.
        if (!hash_equals($user['csrf'], (string)($_GET['csrf'] ?? ''))) respond(403, ['error' => 'Your session expired. Reload the page.']);
        require_step_up($user);   // personal data: fresh 2FA code within 15 minutes
        set_time_limit(120);
        $kind = (string)($_GET['kind'] ?? '');
        $rows = match ($kind) {
            'signups' => export_signups($_GET),
            'runs' => export_runs($_GET),
            default => throw new AdminError('Unknown export.', 404),
        };
        audit($user, 'export.' . $kind, $rows . ' rows');
        exit;
    }
    if (isset($get[$action])) {
        if ($method !== 'GET') respond(405, ['error' => 'Method not allowed.']);
        respond(200, $get[$action]());
    }

    $post = [
        'logout' => function () use ($user) { audit($user, 'logout'); end_session($user); return ['ok' => true]; },
        'step-up' => fn() => step_up($user, $in('code')),
        'backup-codes' => fn() => regenerate_backup_codes($user),
        'change-password' => fn() => change_password($user, $in('current'), $in('password')),
        // Team changes need owner role AND a fresh 2FA step-up (server-enforced).
        'invite' => function () use ($user, $in) { require_owner($user); require_step_up($user); return invite_user($user, $in('email'), $in('role')); },
        'revoke-invite' => function () use ($user, $in) { require_owner($user); return revoke_invite($user, $in('id')); },
        'reset-mfa' => fn() => reset_user_mfa($user, $in('id')),
        'update-user' => function () use ($user, $in, $input) {
            require_owner($user);
            require_step_up($user);
            if ((int)$in('id') === $user['id'] && ($in('status') === 'disabled')) admin_fail('You cannot disable your own account.', 409);
            return update_user($user, $in('id'), $input);
        },
        'reset-link' => function () use ($user, $in) { require_owner($user); require_step_up($user); return create_reset_link($user, $in('id')); },
    ];
    if (isset($post[$action])) {
        if ($method !== 'POST') respond(405, ['error' => 'Method not allowed.']);
        respond(200, $post[$action]());
    }
    respond(404, ['error' => 'Not found.']);
} catch (AdminError $e) {
    respond($e->status, ['error' => $e->getMessage()] + $e->extra);
} catch (Throwable $e) {
    error_log('HOPNOSIS_ADMIN: ' . get_class($e) . ': ' . $e->getMessage());
    respond(500, ['error' => 'Something went wrong. Please try again.']);
}
