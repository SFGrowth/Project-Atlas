CREATE TABLE `tp_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`strategy_id` varchar(32) NOT NULL,
	`strategy_name` varchar(64) NOT NULL,
	`webhook_url` varchar(512),
	`armed` boolean NOT NULL DEFAULT false,
	`frozen_until_owner_approval` boolean NOT NULL DEFAULT false,
	`account_mode` enum('PAPER','EVALUATION','FUNDED','LIVE') NOT NULL DEFAULT 'PAPER',
	`pre_live_gate_required` boolean NOT NULL DEFAULT false,
	`ticker` varchar(16) NOT NULL DEFAULT 'MNQ1!',
	`quantity` int NOT NULL DEFAULT 1,
	`risk_dollars` decimal(10,2) NOT NULL DEFAULT '450.00',
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tp_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `tp_config_strategy_id_unique` UNIQUE(`strategy_id`)
);
--> statement-breakpoint
CREATE TABLE `tp_dispatch_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`idempotency_key` varchar(128) NOT NULL,
	`strategy_id` varchar(32) NOT NULL,
	`bar_time_ms` bigint NOT NULL,
	`direction` enum('LONG','SHORT') NOT NULL,
	`entry_price` decimal(10,4),
	`stop_price` decimal(10,4),
	`target_price` decimal(10,4),
	`status` varchar(32) NOT NULL,
	`http_status` int,
	`response_body` text,
	`error_message` text,
	`atlas_memory_bar_id` int,
	`pipeline_run_id` varchar(128),
	`dispatched_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tp_dispatch_log_id` PRIMARY KEY(`id`),
	CONSTRAINT `tp_dispatch_log_idempotency_key_unique` UNIQUE(`idempotency_key`)
);
