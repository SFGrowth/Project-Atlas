CREATE TABLE `arp1_daily_briefs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`brief_date` date NOT NULL,
	`generated_at` timestamp NOT NULL DEFAULT (now()),
	`heartbeat_task_uid` varchar(65),
	`current_regime` varchar(50),
	`portfolio_readiness` varchar(20),
	`active_specialists` text,
	`walk_forward_status` text,
	`paper_trading_status` text,
	`production_status` text,
	`critical_alerts` text,
	`recommended_actions` text,
	`expected_opportunity` text,
	`operating_normally` boolean NOT NULL DEFAULT true,
	`full_brief` text,
	`status` varchar(20) NOT NULL DEFAULT 'PENDING',
	CONSTRAINT `arp1_daily_briefs_id` PRIMARY KEY(`id`),
	CONSTRAINT `arp1_daily_briefs_brief_date_unique` UNIQUE(`brief_date`)
);
--> statement-breakpoint
CREATE TABLE `arp1_discovery_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bar_timestamp` bigint NOT NULL,
	`ticker` varchar(20) NOT NULL,
	`session` varchar(20),
	`regime` varchar(50),
	`event_type` varchar(50) NOT NULL,
	`event_code` varchar(50),
	`description` text,
	`confidence` decimal(5,4),
	`payload` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `arp1_discovery_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `arp1_model_lifecycle` (
	`id` int AUTO_INCREMENT NOT NULL,
	`model_id` varchar(30) NOT NULL,
	`model_name` varchar(100),
	`current_state` varchar(30) NOT NULL,
	`previous_state` varchar(30),
	`state_entered_at` timestamp NOT NULL DEFAULT (now()),
	`promotion_criteria` json,
	`promotion_evidence` json,
	`auto_promote_enabled` boolean NOT NULL DEFAULT true,
	`sprint_origin` varchar(20),
	`notes` text,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `arp1_model_lifecycle_id` PRIMARY KEY(`id`),
	CONSTRAINT `arp1_model_lifecycle_model_id_unique` UNIQUE(`model_id`)
);
--> statement-breakpoint
CREATE TABLE `arp1_portfolio_intelligence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`calculated_at` timestamp NOT NULL DEFAULT (now()),
	`session_date` date NOT NULL,
	`portfolio_pf` decimal(8,4),
	`portfolio_wr` decimal(5,4),
	`portfolio_max_dd` decimal(10,2),
	`diversification_score` decimal(5,4),
	`regime_coverage` decimal(5,4),
	`confidence_score` decimal(5,4),
	`active_specialists` int DEFAULT 0,
	`idle_specialists` int DEFAULT 0,
	`correlation_matrix` json,
	`capital_allocation` json,
	`regime_breakdown` json,
	`model_summaries` json,
	CONSTRAINT `arp1_portfolio_intelligence_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `arp1_weekly_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`week_start_date` date NOT NULL,
	`week_end_date` date NOT NULL,
	`generated_at` timestamp NOT NULL DEFAULT (now()),
	`heartbeat_task_uid` varchar(65),
	`what_did_atlas_learn` text,
	`what_improved` text,
	`what_deteriorated` text,
	`market_laws_strengthened` text,
	`market_laws_weakened` text,
	`candidates_advanced` text,
	`candidates_failed` text,
	`production_models_review` text,
	`highest_ev_research_dir` text,
	`full_report` text,
	`portfolio_snapshot` json,
	`status` varchar(20) NOT NULL DEFAULT 'PENDING',
	CONSTRAINT `arp1_weekly_reviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `arp1_weekly_reviews_week_start_date_unique` UNIQUE(`week_start_date`)
);
