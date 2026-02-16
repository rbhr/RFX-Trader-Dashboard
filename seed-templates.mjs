import { createConnection } from 'mysql2/promise';
import 'dotenv/config';

async function main() {
  const connection = await createConnection(process.env.DATABASE_URL);

  console.log('\n🌱 Seeding copier templates...\n');

  const templates = [
    {
      name: 'Fixed Lot 0.01',
      description: 'Standard fixed lot size copier with 0.01 lot size, copy SL/TP, skip pending orders',
      multiplier: '1.0000',
      copyStopLoss: true,
      copyTakeProfit: true,
      skipPendingOrders: true,
      scaleTypeId: 3,
      scaleTypeName: 'Fixed lot size',
      active: false,
      monitorOnly: false,
      maxSlippage: 0,
      forceMinTrade: true,
      fixMasterBalanceAndEquity: '0.00',
      fixSlaveBalanceAndEquity: '0.00',
      fixedLotSize: '0.01',
      martingaleStrategy: false,
      openRetry: true,
      openRetryTimeoutInMinutes: 10,
      reverse: false,
      copyOpenPositions: false,
      maxOpenPositions: 0,
      maxLotSize: '0.00',
      maximumLot: '0.00',
      hideComment: false,
      forcePositionLotSize: false,
      ignoreContractSize: false,
      ignoreCurrency: false,
      copyMagicNumber: true,
      copyOriginalComment: false,
    },
    {
      name: 'No Scaling 0.01',
      description: 'No scaling copier with 0.01 fixed lot size, copy SL/TP, skip pending orders',
      multiplier: '1.0000',
      copyStopLoss: true,
      copyTakeProfit: true,
      skipPendingOrders: true,
      scaleTypeId: 4,
      scaleTypeName: 'No scaling',
      active: false,
      monitorOnly: false,
      maxSlippage: 0,
      forceMinTrade: true,
      fixMasterBalanceAndEquity: '0.00',
      fixSlaveBalanceAndEquity: '0.00',
      fixedLotSize: '0.01',
      martingaleStrategy: false,
      openRetry: true,
      openRetryTimeoutInMinutes: 10,
      reverse: false,
      copyOpenPositions: false,
      maxOpenPositions: 0,
      maxLotSize: '0.00',
      maximumLot: '0.00',
      hideComment: false,
      forcePositionLotSize: false,
      ignoreContractSize: false,
      ignoreCurrency: false,
      copyMagicNumber: true,
      copyOriginalComment: false,
    },
  ];

  for (const template of templates) {
    const [result] = await connection.execute(
      `INSERT INTO copier_templates (
        name, description, multiplier, copyStopLoss, copyTakeProfit, skipPendingOrders,
        scaleTypeId, scaleTypeName, active, monitorOnly, maxSlippage, forceMinTrade,
        fixMasterBalanceAndEquity, fixSlaveBalanceAndEquity, fixedLotSize, martingaleStrategy,
        openRetry, openRetryTimeoutInMinutes, reverse, copyOpenPositions, maxOpenPositions,
        maxLotSize, maximumLot, hideComment, forcePositionLotSize, ignoreContractSize,
        ignoreCurrency, copyMagicNumber, copyOriginalComment
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        template.name,
        template.description,
        template.multiplier,
        template.copyStopLoss,
        template.copyTakeProfit,
        template.skipPendingOrders,
        template.scaleTypeId,
        template.scaleTypeName,
        template.active,
        template.monitorOnly,
        template.maxSlippage,
        template.forceMinTrade,
        template.fixMasterBalanceAndEquity,
        template.fixSlaveBalanceAndEquity,
        template.fixedLotSize,
        template.martingaleStrategy,
        template.openRetry,
        template.openRetryTimeoutInMinutes,
        template.reverse,
        template.copyOpenPositions,
        template.maxOpenPositions,
        template.maxLotSize,
        template.maximumLot,
        template.hideComment,
        template.forcePositionLotSize,
        template.ignoreContractSize,
        template.ignoreCurrency,
        template.copyMagicNumber,
        template.copyOriginalComment,
      ]
    );
    console.log(`✅ Created template: ${template.name}`);
  }

  await connection.end();
  console.log('\n✨ Seeding complete!\n');
}

main().catch(console.error);
