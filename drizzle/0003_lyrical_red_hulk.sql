ALTER TABLE `magic_numbers` ADD `mtAccount` varchar(50);--> statement-breakpoint
ALTER TABLE `magic_numbers` ADD `mtServer` varchar(100);--> statement-breakpoint
ALTER TABLE `magic_numbers` ADD `mtPassword` varchar(255);--> statement-breakpoint
ALTER TABLE `magic_numbers` ADD `mtLocation` varchar(100);--> statement-breakpoint
ALTER TABLE `magic_numbers` ADD `lifetimeProfit` decimal(15,2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE `magic_numbers` ADD `lifetimeProfitShare` decimal(15,2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE `magic_numbers` ADD `lifetimeIncome` decimal(15,2) DEFAULT '0.00';