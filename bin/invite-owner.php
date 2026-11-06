<?php
// Bootstrap: create a one-time OWNER invite link for the quiz admin (7 days). On the server:
//   sudo -u hopnosis php /var/www/quiz.hopnosis.co.za/current/bin/invite-owner.php kelly@example.com
// Open the printed link, enter a name, choose a password, then set up the authenticator app.
// Copied from PowerHER's bin/invite-owner.php.
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../api/lib/admin_auth.php';

$email = normalize_email($argv[1] ?? '');
if ($email === '') { fwrite(STDERR, "Usage: php invite-owner.php email@example.com\n"); exit(1); }
$stmt = hq_db()->prepare('SELECT id FROM admin_users WHERE email = ?');
$stmt->execute([$email]);
if ($stmt->fetchColumn() !== false) { fwrite(STDERR, "$email already has an account. Ask an owner for a reset link instead.\n"); exit(1); }
$link = create_link('invite', $email, 'owner', null, null);
audit(['email' => 'server console'], 'invite.created', "$email as owner (console)");
echo "Owner invite for $email (valid 7 days, single use):\n$link\n";
