<?php
// Core for the quiz admin: settings, DB, and stand-ins for PowerHER's realtime layer.
// admin_auth.php and mfa.php are copied from the PowerHER admin (investec powerher/server/lib),
// renamed to hq_* and pointed at the quiz's own database. Not an endpoint (Apache also denies /api/lib/).
declare(strict_types=1);

if (PHP_SAPI !== 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    http_response_code(404);
    exit;
}

/** .../quiz.hopnosis.co.za/releases/<ts>/api/lib (or .../current/...) → .../quiz.hopnosis.co.za */
function hq_base(): string
{
    return preg_replace('#/(releases/[^/]+|current)/(api/lib|bin)$#', '', __DIR__);
}

function hq_settings(): array
{
    static $settings = null;
    if ($settings === null) {
        $file = getenv('HOPNOSIS_SETTINGS') ?: hq_base() . '/shared/config/settings.php';
        $settings = is_file($file) ? require $file : [];
    }
    return $settings;
}

function hq_db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $s = hq_settings();
        $pdo = new PDO($s['db_dsn'], $s['db_user'], $s['db_pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $pdo->exec("SET time_zone = '+00:00'");
    }
    return $pdo;
}

// PowerHER pushes session revocations over its WebSocket server. The quiz admin has no
// socket (it polls), so these are no-ops: revoked sessions fail on their next request.
function ws_notify(array $message): void {}
function ws_session_id(string $sessionHash): string { return substr($sessionHash, 0, 24); }
