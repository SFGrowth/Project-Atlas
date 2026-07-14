ALTER TABLE `paper_trades` ADD `provenance` enum('PAPER','BACKTEST','LIVE','TEST','CONTAMINATED') DEFAULT 'PAPER' NOT NULL;--> statement-breakpoint
ALTER TABLE `paper_trades` ADD `data_source` varchar(64);--> statement-breakpoint
ALTER TABLE `sb1_paper_trades` ADD `provenance` enum('PAPER','BACKTEST','LIVE','TEST','CONTAMINATED') DEFAULT 'PAPER' NOT NULL;--> statement-breakpoint
ALTER TABLE `sb1_paper_trades` ADD `data_source` varchar(64);