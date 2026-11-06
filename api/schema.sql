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

-- Fixed-window request counter per IP (Pulse keeps these in files; here the DB is simpler).
CREATE TABLE IF NOT EXISTS `rate_limits` (
    `bucket` VARCHAR(80) NOT NULL,
    `window_start` INT UNSIGNED NOT NULL,
    `hits` INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (`bucket`),
    KEY `idx_rate_limits_window` (`window_start`)
) ENGINE=InnoDB DEFAULT CHARSET=ascii COLLATE=ascii_bin;
