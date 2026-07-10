CREATE TABLE `journal_days` (
	`id` int AUTO_INCREMENT NOT NULL,
	`trade_date` date NOT NULL,
	`account` varchar(64) NOT NULL DEFAULT 'ATLAS_MNQ_PAPER',
	`total_trades` int DEFAULT 0,
	`wins` int DEFAULT 0,
	`losses` int DEFAULT 0,
	`breakevens` int DEFAULT 0,
	`daily_pnl` decimal(10,2) DEFAULT '0',
	`daily_r` decimal(8,4) DEFAULT '0',
	`profit_factor` decimal(8,4),
	`win_rate` decimal(6,4),
	`largest_winner` decimal(10,2),
	`largest_loser` decimal(10,2),
	`models_traded` varchar(64),
	`ari_interventions` int DEFAULT 0,
	`tvl_interventions` int DEFAULT 0,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `journal_days_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(64) NOT NULL,
	`title` varchar(128) NOT NULL,
	`body` text,
	`delivered` boolean DEFAULT false,
	`sent_at` timestamp NOT NULL DEFAULT (now()),
	`metadata` json,
	CONSTRAINT `notification_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `paper_trades` (
	`id` varchar(64) NOT NULL,
	`account` varchar(64) NOT NULL DEFAULT 'ATLAS_MNQ_PAPER',
	`symbol` varchar(16) NOT NULL DEFAULT 'MNQ1!',
	`direction` enum('LONG','SHORT') NOT NULL,
	`model` varchar(16) NOT NULL,
	`status` enum('OPEN','CLOSED','CANCELLED') NOT NULL DEFAULT 'OPEN',
	`entry` decimal(12,4),
	`stop` decimal(12,4),
	`target` decimal(12,4),
	`exit_price` decimal(12,4),
	`exit_reason` varchar(64),
	`contracts` int DEFAULT 1,
	`risk_dollars` decimal(10,2),
	`pnl` decimal(10,2),
	`current_r` decimal(8,4),
	`mfe` decimal(10,2),
	`mae` decimal(10,2),
	`opened_at` timestamp NOT NULL DEFAULT (now()),
	`closed_at` timestamp,
	`trade_duration_ms` bigint,
	`pipeline_run_id` varchar(128),
	`edge_score` decimal(6,4),
	`ade_decision` varchar(32),
	`ari_decision` varchar(32),
	`tvl_decision` varchar(32),
	`brain_view` text,
	`notes` text,
	`replay_bar_index` int,
	CONSTRAINT `paper_trades_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_health_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`event_type` varchar(64) NOT NULL,
	`severity` enum('INFO','WARN','ERROR') NOT NULL DEFAULT 'INFO',
	`message` text,
	`metadata` json,
	`ts` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `system_health_events_id` PRIMARY KEY(`id`)
);
