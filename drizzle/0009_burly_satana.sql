CREATE TABLE `payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`magicNumberId` int NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`transactionHash` varchar(255) NOT NULL,
	`paymentDate` timestamp NOT NULL,
	`notificationSent` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `magic_numbers` ADD `usdtAddress` varchar(255);--> statement-breakpoint
ALTER TABLE `magic_numbers` ADD `usdtNetwork` enum('TRC20','ERC20');