CREATE TABLE `magic_numbers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`magicNumber` varchar(20) NOT NULL,
	`name` varchar(100) NOT NULL,
	`password` varchar(255) NOT NULL,
	`profitShare` decimal(5,4) NOT NULL DEFAULT '0.3500',
	`showAllData` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `magic_numbers_id` PRIMARY KEY(`id`),
	CONSTRAINT `magic_numbers_magicNumber_unique` UNIQUE(`magicNumber`)
);
--> statement-breakpoint
CREATE TABLE `trading_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionToken` varchar(255) NOT NULL,
	`magicNumberId` int NOT NULL,
	`ipAddress` varchar(45),
	`userAgent` text,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trading_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `trading_sessions_sessionToken_unique` UNIQUE(`sessionToken`)
);
