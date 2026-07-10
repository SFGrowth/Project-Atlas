CREATE TABLE `pipeline_reports` (
	`id` varchar(64) NOT NULL,
	`idempotency_key` varchar(128) NOT NULL,
	`received_at` timestamp NOT NULL DEFAULT (now()),
	`bar_time` varchar(32),
	`symbol` varchar(16) NOT NULL,
	`master_state` varchar(32),
	`pipeline_run_id` varchar(128),
	`ingestion_latency_ms` bigint,
	`payload` json NOT NULL,
	CONSTRAINT `pipeline_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `pipeline_reports_idempotency_key_unique` UNIQUE(`idempotency_key`)
);
