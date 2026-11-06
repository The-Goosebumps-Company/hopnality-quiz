#!/bin/bash
# Idempotent setup for quiz.hopnosis.co.za on the shared Xneelo VM (the PowerHER box).
# Run as root by deploy.sh. Same layout as Pulse: /var/www/<domain>/{releases,current,shared}.
#
# Kept apart from PowerHER on purpose:
#   - own Linux user and PHP-FPM pool (PowerHER's global open_basedir would block us otherwise)
#   - own Apache vhost files, logs and headers; PowerHER's deploy never rewrites them
#   - own database and DB user on the same MariaDB, like Pulse's staging_pulse beside pulse_app
#   - own encrypted backups in shared/backups
# Touches nothing under /srv/powerher, /etc/powerher or PowerHER's Apache/PHP/MariaDB config.
set -euo pipefail
DOMAIN=quiz.hopnosis.co.za
BASE=/var/www/$DOMAIN
APPUSER=hopnosis
DB=hopnosis
PHPV=$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;')
SOCK=/run/php/hopnosis-quiz.sock

# ---- User and folders ---------------------------------------------------------------
id "$APPUSER" >/dev/null 2>&1 || useradd --system --no-create-home --home-dir "$BASE" --shell /usr/sbin/nologin "$APPUSER"
install -d -o ubuntu -g www-data -m 755 "$BASE" "$BASE/releases"
install -d -o root -g root -m 755 "$BASE/shared"
install -d -o root -g "$APPUSER" -m 750 "$BASE/shared/config"
install -d -o "$APPUSER" -g "$APPUSER" -m 700 "$BASE/shared/data"
install -d -o root -g root -m 700 "$BASE/shared/backups"
if [ ! -e "$BASE/current" ]; then
  install -d -o ubuntu -g www-data -m 755 "$BASE/releases/00000000000000"
  echo '<!doctype html><title>hopnøsis</title><p>Coming soon.</p>' > "$BASE/releases/00000000000000/index.html"
  ln -sfn "$BASE/releases/00000000000000" "$BASE/current"
  chown -h ubuntu:www-data "$BASE/current"
fi

# ---- Database (generated once; the password never leaves the server) ----------------
if [ ! -f "$BASE/shared/config/settings.php" ]; then
  DBPASS=$(openssl rand -hex 24)
  mariadb -e "CREATE DATABASE IF NOT EXISTS $DB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    CREATE USER IF NOT EXISTS '$DB'@'localhost' IDENTIFIED BY '$DBPASS';
    ALTER USER '$DB'@'localhost' IDENTIFIED BY '$DBPASS';
    GRANT SELECT, INSERT, UPDATE, DELETE ON $DB.* TO '$DB'@'localhost'; FLUSH PRIVILEGES;"
  umask 027
  cat > "$BASE/shared/config/settings.php" <<EOF
<?php
return [
    'db_dsn' => 'mysql:unix_socket=/run/mysqld/mysqld.sock;dbname=$DB;charset=utf8mb4',
    'db_user' => '$DB',
    'db_pass' => '$DBPASS',
    'app_url' => 'https://$DOMAIN/',
];
EOF
  umask 022
fi
# Quiz admin: a separate 32-byte key encrypts 2FA secrets at rest (libsodium secretbox), as in PowerHER.
if ! grep -q "'data_key'" "$BASE/shared/config/settings.php"; then
  DATAKEY=$(openssl rand -base64 32)
  sed -i "s|^\];|    'data_key' => '$DATAKEY',\n];|" "$BASE/shared/config/settings.php"
fi
chown root:"$APPUSER" "$BASE/shared/config/settings.php"; chmod 640 "$BASE/shared/config/settings.php"
# Schema lives in the release (api/schema.sql) once the intake form exists.
# Applied from the release about to go live (deploy.sh passes its path), before the flip.
RELEASE=${1:-$BASE/current}
if [ -f "$RELEASE/api/schema.sql" ]; then mariadb "$DB" < "$RELEASE/api/schema.sql"; fi

# ---- PHP-FPM pool (own user; overrides PowerHER's global open_basedir) ---------------
cat > /etc/php/$PHPV/fpm/pool.d/hopnosis-quiz.conf <<EOF
[hopnosis-quiz]
user = $APPUSER
group = $APPUSER
listen = $SOCK
listen.owner = www-data
listen.group = www-data
listen.mode = 0660
pm = ondemand
pm.max_children = 24
pm.process_idle_timeout = 30s
pm.max_requests = 2000
php_admin_value[open_basedir] = $BASE/:/tmp/
; Releases flip a symlink, so don't cache resolved paths for long.
php_admin_value[realpath_cache_ttl] = 2
php_admin_value[error_log] = /var/log/apache2/hopnosis-quiz-php.log
php_admin_flag[log_errors] = on
EOF
touch /var/log/apache2/hopnosis-quiz-php.log && chown "$APPUSER":adm /var/log/apache2/hopnosis-quiz-php.log && chmod 640 /var/log/apache2/hopnosis-quiz-php.log

# ---- Apache (sites named after the domain, so PowerHER stays the default vhost) --------------------------------------------------------------------------
cat > /etc/apache2/hopnosis-quiz-app.conf <<EOF
    ServerName $DOMAIN
    DocumentRoot $BASE/current
    DirectoryIndex index.html index.php

    <Directory $BASE>
        Require all denied
    </Directory>
    <Directory $BASE/current>
        Options -Indexes +FollowSymLinks
        AllowOverride None
        Require all granted
    </Directory>
    <FilesMatch "\.php\$">
        SetHandler "proxy:unix:$SOCK|fcgi://hopnosis-quiz/"
    </FilesMatch>
    <FilesMatch "^\.(?!well-known)">
        Require all denied
    </FilesMatch>
    <LocationMatch "\.(sql|md|sh)\$">
        Require all denied
    </LocationMatch>
    # PHP libraries and the CLI are never web-reachable (they also 404 themselves).
    <LocationMatch "^/(api/lib|bin)/">
        Require all denied
    </LocationMatch>
    <If "! %{REQUEST_METHOD} in { 'GET', 'HEAD', 'POST' }">
        Require all denied
    </If>

    # Scripts only from us; fonts from Google Fonts (the quiz uses Jost).
    Header always set Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    Header always set X-Content-Type-Options "nosniff"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
    Header always set Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
    Header always set X-Frame-Options "DENY"
    Header always unset X-Powered-By
    # File names aren't fingerprinted: always revalidate code, let images cache for a day.
    <LocationMatch "\.(html|js|css)\$|/\$">
        Header set Cache-Control "no-cache"
    </LocationMatch>
    <LocationMatch "^/assets/">
        Header set Cache-Control "public, max-age=86400"
    </LocationMatch>
    # Quiz admin (React app copied from PowerHER's admin): same CSP as PowerHER's /admin,
    # plus Google Fonts for Jost. Hashed build files cache forever; index.html never does.
    <Directory $BASE/current/admin>
        DirectoryIndex index.html
        Header always set Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        Header always set X-Robots-Tag "noindex, nofollow"
    </Directory>
    <LocationMatch "^/admin/assets/">
        Header set Cache-Control "public, max-age=31536000, immutable"
    </LocationMatch>
    AddOutputFilterByType DEFLATE text/html text/css text/javascript application/javascript application/json image/svg+xml

    ErrorLog \${APACHE_LOG_DIR}/hopnosis-quiz-error.log
    CustomLog \${APACHE_LOG_DIR}/hopnosis-quiz-access.log combined
EOF

CERT=/etc/letsencrypt/live/$DOMAIN
write_http_only() {
  cat > /etc/apache2/sites-available/$DOMAIN.conf <<EOF
<VirtualHost *:80>
    Include /etc/apache2/hopnosis-quiz-app.conf
</VirtualHost>
EOF
}
write_tls() {
  cat > /etc/apache2/sites-available/$DOMAIN.conf <<EOF
<VirtualHost *:80>
    ServerName $DOMAIN
    DocumentRoot $BASE/current
    <Directory $BASE/current>
        Require all granted
    </Directory>
    RewriteEngine on
    RewriteRule ^/\.well-known/acme-challenge/ - [L]
    RewriteRule ^ https://%{SERVER_NAME}%{REQUEST_URI} [END,NE,R=permanent]
</VirtualHost>
EOF
  cat > /etc/apache2/sites-available/$DOMAIN-le-ssl.conf <<EOF
<IfModule mod_ssl.c>
<VirtualHost *:443>
    Protocols h2 http/1.1
    Include /etc/apache2/hopnosis-quiz-app.conf
    Header always set Strict-Transport-Security "max-age=31536000"
    SSLCertificateFile $CERT/fullchain.pem
    SSLCertificateKeyFile $CERT/privkey.pem
    Include /etc/letsencrypt/options-ssl-apache.conf
</VirtualHost>
</IfModule>
EOF
  a2ensite -q $DOMAIN-le-ssl >/dev/null
}

if [ -f "$CERT/fullchain.pem" ]; then write_tls; else write_http_only; fi
# Site files are named after the domain (as on Pulse). Apache's default vhost is the first
# file alphabetically, and "quiz…" sorts after "powerher…", so PowerHER stays the default.
for old in hopnosis-quiz hopnosis-quiz-le-ssl; do a2dissite -q $old >/dev/null 2>&1 || true; rm -f /etc/apache2/sites-available/$old.conf; done
a2ensite -q $DOMAIN >/dev/null

apache2ctl configtest
systemctl reload php$PHPV-fpm
systemctl reload apache2

# ---- Certificate: only once quiz.hopnosis.co.za points at this box ---------------------
if [ ! -f "$CERT/fullchain.pem" ]; then
  PUBLIC_IP=154.65.107.108   # the VM's public IP (Xneelo); see the PowerHER runbook
  DNS_IP=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)
  if [ -n "$PUBLIC_IP" ] && [ "$DNS_IP" = "$PUBLIC_IP" ]; then
    certbot certonly --webroot -w "$BASE/current" -d "$DOMAIN" --non-interactive --agree-tos \
      --register-unsafely-without-email --keep-until-expiring \
      --deploy-hook "systemctl reload apache2"
    write_tls
    apache2ctl configtest
    systemctl reload apache2
    echo "certificate issued for $DOMAIN"
  else
    echo "NOTE: $DOMAIN resolves to '${DNS_IP:-nothing}', this box is $PUBLIC_IP. Serving HTTP only until DNS points here; rerun deploy after."
  fi
fi

# ---- Encrypted hourly backups (same age key as PowerHER: private half held off-server by G&G)
cat > /usr/local/bin/hopnosis-backup <<EOF
#!/bin/bash
set -euo pipefail
umask 077
PUB=/etc/powerher-backup.pub
DIR=$BASE/shared/backups
if ! grep -q '^age1' "\$PUB" 2>/dev/null; then logger -t hopnosis-backup "ERROR: no age public key in \$PUB; backup skipped"; exit 1; fi
OUT="\$DIR/hopnosis-\$(date -u +%Y%m%d-%H%M).sql.gz.age"
mariadb-dump --single-transaction --quick $DB | gzip | age -R "\$PUB" > "\$OUT.part"
mv "\$OUT.part" "\$OUT"
find "\$DIR" -name 'hopnosis-*.sql.gz.age' -mtime +14 -delete
EOF
chmod 750 /usr/local/bin/hopnosis-backup
echo '17 * * * * root /usr/local/bin/hopnosis-backup' > /etc/cron.d/hopnosis-backup

echo "server-setup done"
