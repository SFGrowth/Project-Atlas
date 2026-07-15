CREATE TABLE `mnq_candles` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`ticker` varchar(16) NOT NULL,
	`window_start` bigint NOT NULL,
	`session_end_date` date NOT NULL,
	`open` decimal(12,4) NOT NULL,
	`high` decimal(12,4) NOT NULL,
	`low` decimal(12,4) NOT NULL,
	`close` decimal(12,4) NOT NULL,
	`volume` int NOT NULL DEFAULT 0,
	`transactions` int NOT NULL DEFAULT 0,
	`dollar_volume` decimal(20,2),
	`bar_time_et` varchar(32),
	`session` varchar(16),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mnq_candles_id` PRIMARY KEY(`id`)
);
