ALTER TABLE `strategy_registry` ADD `pine_enabled` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `strategy_registry` ADD `pine_strategy_key` varchar(32);--> statement-breakpoint
ALTER TABLE `strategy_registry` ADD `pine_version` varchar(16);--> statement-breakpoint
ALTER TABLE `strategy_registry` ADD `pine_rule_hash` varchar(128);--> statement-breakpoint
ALTER TABLE `strategy_registry` ADD `pine_parity_status` varchar(32) DEFAULT 'NOT_CONFIGURED';--> statement-breakpoint
ALTER TABLE `strategy_registry` ADD `pine_last_verified_at` bigint;--> statement-breakpoint
ALTER TABLE `strategy_registry` ADD `pine_chart_colour` varchar(16);--> statement-breakpoint
ALTER TABLE `strategy_registry` ADD `pine_webhook_enabled` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `strategy_registry` ADD `pine_last_webhook_at` bigint;--> statement-breakpoint
ALTER TABLE `strategy_registry` ADD `pine_last_signal_at` bigint;--> statement-breakpoint
ALTER TABLE `strategy_registry` ADD `pine_last_signal_direction` varchar(8);--> statement-breakpoint
ALTER TABLE `strategy_registry` ADD `pine_last_signal_score` decimal(8,2);--> statement-breakpoint
ALTER TABLE `strategy_registry` ADD `pine_known_gaps` text;