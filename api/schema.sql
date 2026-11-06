-- Applied as root by deploy/server-setup.sh on every deploy, so it must stay idempotent
-- (CREATE ... IF NOT EXISTS, additive changes only). The app's DB user has no DDL rights.

CREATE TABLE IF NOT EXISTS `subscribers` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(254) NOT NULL,
    `flavour` VARCHAR(16) NULL,              -- quiz result when they signed up
    `source` VARCHAR(32) NULL,               -- ?src= on the quiz link, e.g. "can"
    `consent_text` VARCHAR(255) NOT NULL,    -- exact wording they ticked (POPIA proof of consent)
    `consented_at` DATETIME NOT NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` VARCHAR(500) NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_subscribers_email` (`email`),
    KEY `idx_subscribers_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Anonymous quiz analytics: one row per run (api/track.php). No personal data.
CREATE TABLE IF NOT EXISTS `results` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `token` CHAR(32) NOT NULL,                -- random; only the browser that started the run knows it
    `source` VARCHAR(32) NULL,                -- ?src= on the link: can, poster, board…
    `started_at` DATETIME NOT NULL,           -- UTC
    `finished_at` DATETIME NULL,              -- NULL = didn't finish
    `flavour` VARCHAR(8) NULL,                -- quiz result
    `picks` VARCHAR(64) NULL,                 -- flavour picked per question, comma separated
    `tiebreak` VARCHAR(16) NULL,              -- legacy pre-Unicorn showdown; new runs leave this NULL
    `nailed` VARCHAR(8) NULL,                 -- "Did we nail it?": actual favourite or 'untried'
    `age_band` VARCHAR(16) NULL,
    `city` VARCHAR(32) NULL,
    `suburb` VARCHAR(60) NULL,
    `channels` VARCHAR(100) NULL,             -- where they'd buy or drink, comma separated
    `insight_skipped` TINYINT(1) NOT NULL DEFAULT 0,
    `shares` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `squares` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `shop_clicks` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `mix_clicks` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `optins` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_results_token` (`token`),
    KEY `idx_results_started` (`started_at`),
    KEY `idx_results_flavour` (`flavour`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fixed-window request counter per IP (Pulse keeps these in files; here the DB is simpler).
CREATE TABLE IF NOT EXISTS `rate_limits` (
    `bucket` VARCHAR(80) NOT NULL,
    `window_start` INT UNSIGNED NOT NULL,
    `hits` INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (`bucket`),
    KEY `idx_rate_limits_window` (`window_start`)
) ENGINE=InnoDB DEFAULT CHARSET=ascii COLLATE=ascii_bin;

-- ---- Quiz admin (copied from PowerHER's schema: invite-only accounts, sessions, 2FA, audit) ----
CREATE TABLE IF NOT EXISTS admin_rate_limits (
  name        VARCHAR(120) NOT NULL PRIMARY KEY,
  hits        INT UNSIGNED NOT NULL,
  expires_at  INT UNSIGNED NOT NULL,
  KEY idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=ascii;

CREATE TABLE IF NOT EXISTS admin_users (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email           VARCHAR(255) NOT NULL UNIQUE,
  name            VARCHAR(120) NOT NULL DEFAULT '',
  password_hash   VARCHAR(255) NOT NULL DEFAULT '',
  role            ENUM('owner','admin') NOT NULL DEFAULT 'admin',
  status          ENUM('active','disabled') NOT NULL DEFAULT 'active',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at   DATETIME NULL,
  totp_secret     VARCHAR(255) NULL,
  totp_pending    VARCHAR(255) NULL,
  totp_enabled_at DATETIME NULL,
  backup_codes    TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One-time links: 'invite' creates an account, 'reset' sets a new password. Only the SHA-256 is stored.
CREATE TABLE IF NOT EXISTS admin_tokens (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  purpose     ENUM('invite','reset') NOT NULL,
  token_hash  CHAR(64) NOT NULL UNIQUE,
  email       VARCHAR(255) NOT NULL,
  role        ENUM('owner','admin') NOT NULL DEFAULT 'admin',
  user_id     INT UNSIGNED NULL,
  created_by  INT UNSIGNED NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  DATETIME NOT NULL,
  used_at     DATETIME NULL,
  KEY idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash    CHAR(64) NOT NULL PRIMARY KEY,
  user_id       INT UNSIGNED NOT NULL,
  csrf_token    CHAR(64) NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at    DATETIME NOT NULL,
  ip            VARCHAR(45) NOT NULL DEFAULT '',
  user_agent    VARCHAR(255) NOT NULL DEFAULT '',
  mfa_ok        TINYINT(1) NOT NULL DEFAULT 0,
  stepup_at     DATETIME NULL,
  KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=ascii;

CREATE TABLE IF NOT EXISTS admin_audit (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NULL,
  email       VARCHAR(255) NOT NULL DEFAULT '',
  action      VARCHAR(60) NOT NULL,
  detail      VARCHAR(500) NOT NULL DEFAULT '',
  ip          VARCHAR(45) NOT NULL DEFAULT '',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A correct password only earns a short-lived two-factor CHALLENGE (own cookie, no data access).
CREATE TABLE IF NOT EXISTS admin_mfa_challenges (
  token_hash CHAR(64)     NOT NULL PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  csrf_token CHAR(64)     NOT NULL,
  purpose    VARCHAR(10)  NOT NULL,
  expires_at DATETIME     NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip         VARCHAR(45)  NOT NULL DEFAULT '',
  KEY idx_user (user_id),
  KEY idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=ascii;

CREATE TABLE IF NOT EXISTS admin_otp_used (
  key_hash   CHAR(64) NOT NULL PRIMARY KEY,
  expires_at DATETIME NOT NULL,
  KEY idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=ascii;
