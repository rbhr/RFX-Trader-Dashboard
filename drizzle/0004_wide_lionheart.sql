ALTER TABLE `magic_numbers` ADD `mtVersion` varchar(10) DEFAULT 'MT5';--> statement-breakpoint
ALTER TABLE `magic_numbers` ADD `mcLocation` varchar(50) DEFAULT 'London';--> statement-breakpoint
ALTER TABLE `magic_numbers` DROP COLUMN `mtLocation`;