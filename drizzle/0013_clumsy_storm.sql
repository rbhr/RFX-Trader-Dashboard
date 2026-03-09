CREATE TABLE `risk_limit_breaches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`magicNumberId` int NOT NULL,
	`equityAtBreach` decimal(15,2) NOT NULL,
	`riskLimitAtBreach` decimal(15,2) NOT NULL,
	`traderNotified` boolean NOT NULL DEFAULT false,
	`adminNotified` boolean NOT NULL DEFAULT false,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `risk_limit_breaches_id` PRIMARY KEY(`id`)
);
