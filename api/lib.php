<?php
// Shared helpers for the quiz API. Not an endpoint: requesting it directly returns 404.
declare(strict_types=1);

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    http_response_code(404);
    exit;
}

function respond(int $status, bool $ok, string $message, array $data = []): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['success' => $ok, 'message' => $message, 'data' => $data ?: null], JSON_UNESCAPED_UNICODE);
    exit;
}

/** Same-origin JSON POST only; returns the decoded body. */
function read_json_post(): array
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        header('Allow: POST');
        respond(405, false, 'Method not allowed.');
    }
    // A cross-site <form> can't send application/json, and browsers always send Origin on fetch POSTs.
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    if (($_SERVER['HTTP_ORIGIN'] ?? '') !== $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? '')) {
        respond(403, false, 'Not allowed.');
    }
    if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) {
        respond(415, false, 'Send JSON.');
    }
    $data = json_decode((string) file_get_contents('php://input', false, null, 0, 8192), true);
    if (!is_array($data)) {
        respond(400, false, 'That didn\'t go through. Try again in a moment.');
    }
    return $data;
}

function db(): PDO
{
    // .../quiz.hopnosis.co.za/releases/<ts>/api (or .../current/api) → .../quiz.hopnosis.co.za
    $base = preg_replace('#/(releases/[^/]+|current)/api$#', '', __DIR__);
    $settings = require $base . '/shared/config/settings.php';
    try {
        return new PDO($settings['db_dsn'], $settings['db_user'], $settings['db_pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (Throwable $e) {
        error_log('[quiz-api] DB connect failed: ' . $e->getMessage());
        respond(503, false, 'We\'re having a moment. Try again shortly.');
    }
}

function client_ip(): string
{
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 0, 45);
}

/** Fixed-window rate limit per IP and bucket name (Pulse keeps these in files; here the DB is simpler). */
function rate_limit(PDO $db, string $name, int $limit, int $window): void
{
    $bucket = substr($name . ':' . client_ip(), 0, 80);
    $slot = intdiv(time(), $window);
    $db->prepare('INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?, ?, 1)
                  ON DUPLICATE KEY UPDATE hits = IF(window_start = VALUES(window_start), hits + 1, 1),
                                          window_start = VALUES(window_start)')
       ->execute([$bucket, $slot]);
    $hits = $db->prepare('SELECT hits FROM rate_limits WHERE bucket = ?');
    $hits->execute([$bucket]);
    if ((int) $hits->fetchColumn() > $limit) {
        header('Retry-After: ' . $window);
        respond(429, false, 'Easy, tiger. Try again in a few minutes.');
    }
    if (random_int(1, 200) === 1) {
        $db->prepare('DELETE FROM rate_limits WHERE window_start < ?')->execute([$slot - 2]);
    }
}

function source_param($value): ?string
{
    return is_string($value) && preg_match('/^[a-z0-9_-]{1,32}$/', $value) ? $value : null;
}

const FLAVOURS = ['classic', 'mango', 'lime'];
