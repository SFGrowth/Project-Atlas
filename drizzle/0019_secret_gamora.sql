CREATE TABLE `apex_safety_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`timestamp_ms` bigint NOT NULL,
	`event_type` enum('HALT_TRIGGERED','HALT_ACKNOWLEDGED','HALT_CLEARED','COUNTER_RESET','LOSS_RECORDED') NOT NULL,
	`halt_reason` varchar(50),
	`triggered_by` varchar(100),
	`details` text,
	CONSTRAINT `apex_safety_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `apex_safety_state` (
	`id` int AUTO_INCREMENT NOT NULL,
	`is_halted` boolean NOT NULL DEFAULT false,
	`halt_reason` enum('DAILY_LOSS_LOCKOUT','CONSECUTIVE_LOSS_PROTECTION','EXECUTION_ANOMALY','WEBHOOK_FAILURE','DATA_INTEGRITY_FAILURE','DRIFT_SUSPENSION'),
	`halt_details` text,
	`halted_at` bigint,
	`acknowledged_by` varchar(100),
	`acknowledged_at` bigint,
	`cleared_at` bigint,
	`daily_losses` int NOT NULL DEFAULT 0,
	`daily_loss_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
	`consecutive_losses` int NOT NULL DEFAULT 0,
	CONSTRAINT `apex_safety_state_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exec_cert_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`run_type` enum('DRY_RUN','PRE_LIVE_GATE') NOT NULL,
	`started_at` bigint NOT NULL,
	`completed_at` bigint,
	`overall_status` enum('PASS','FAIL','IN_PROGRESS','ABORTED') NOT NULL DEFAULT 'IN_PROGRESS',
	`stages_passed` int NOT NULL DEFAULT 0,
	`stages_failed` int NOT NULL DEFAULT 0,
	`stages_skipped` int NOT NULL DEFAULT 0,
	`total_latency_ms` int,
	`notes` text,
	`certified_by` varchar(100),
	CONSTRAINT `exec_cert_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exec_stage_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`run_id` int NOT NULL,
	`stage_number` int NOT NULL,
	`stage_name` varchar(100) NOT NULL,
	`stage_type` enum('AUTO','MANUAL') NOT NULL,
	`status` enum('PASS','FAIL','SKIP','PENDING') NOT NULL DEFAULT 'PENDING',
	`timestamp_ms` bigint,
	`latency_ms` int,
	`retry_count` int NOT NULL DEFAULT 0,
	`error_message` text,
	`details` text,
	CONSTRAINT `exec_stage_results_id` PRIMARY KEY(`id`)
);
