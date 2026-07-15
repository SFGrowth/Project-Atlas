CREATE TABLE `portfolio_execution_config` (
	`id` int NOT NULL DEFAULT 1,
	`execution_state` enum('PAPER_ONLY','APEX_EVAL_ACTIVE','HALTED') NOT NULL DEFAULT 'PAPER_ONLY',
	`webhook_url` varchar(512),
	`account_label` varchar(64) DEFAULT 'APEX_50K_EVAL',
	`ticker` varchar(16) NOT NULL DEFAULT 'MNQ1!',
	`quantity` int NOT NULL DEFAULT 1,
	`risk_dollars` decimal(10,2) NOT NULL DEFAULT '450.00',
	`activated_at` bigint,
	`activated_by_owner` boolean NOT NULL DEFAULT false,
	`halt_reason` text,
	`halted_at` bigint,
	`last_approved_model` varchar(32),
	`last_dispatch_at` bigint,
	`last_dispatch_status` varchar(32),
	`last_tp_response` text,
	`notes` text,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `portfolio_execution_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `portfolio_strategy_controls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`strategy_id` varchar(32) NOT NULL,
	`strategy_status` enum('ENABLED','PAUSED','RETIRED','FAULTED') NOT NULL DEFAULT 'ENABLED',
	`pause_reason` text,
	`last_proposal_at` bigint,
	`last_selected_at` bigint,
	`last_ade_score` decimal(8,4),
	`last_direction` varchar(8),
	`last_no_trade_reason` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `portfolio_strategy_controls_id` PRIMARY KEY(`id`),
	CONSTRAINT `portfolio_strategy_controls_strategy_id_unique` UNIQUE(`strategy_id`)
);
