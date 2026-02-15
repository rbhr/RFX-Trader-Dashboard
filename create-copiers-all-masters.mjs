import { createConnection } from 'mysql2/promise';
import 'dotenv/config';

const API_KEY = process.env.METACOPIER_API_KEY;
const LIVE_ACCOUNT = '251974020';

// RFX Master accounts (fetched from MetaCopier API)
const RFX_MASTER_ACCOUNTS = [
  { id: 'c3d6a0ef-3a3a-4f5c-9300-4b253164bc94', alias: '01 exness Master 1', login: '251974020' },
  { id: '80145ac1-18fb-47a5-b55e-ad30bd0e6c87', alias: '05 exness Small Master 1752', login: '249951752' },
  { id: '6cc7942f-7e8e-4619-a69b-ba77463e6c95', alias: '06 ICMSC 6366', login: '11626366' },
  { id: '5de38f05-9e3d-4925-8495-0f58896dae8d', alias: 'AXI Select - 9109', login: '60089109' },
  { id: '2ed6700f-698a-48ae-9c2a-34c1b49e993f', alias: '07 AXI 9108', login: '60089108' },
  { id: '253cb74c-fcef-44a5-87ee-e9bd34187d50', alias: 'Exness bomb', login: '249833260' },
  { id: '0abde667-1558-48fa-a0cb-7dc9f2c25bcb', alias: 'SC1', login: '276849' },
];

async function createCopier(toAccountId, fromAccountId, fromAccountAlias, customMagic) {
  try {
    const copierData = {
      fromAccountId,
      fromAccountAlias,
      toAccountId,
      multiplier: 1.0,
      copyStopLoss: true,
      copyTakeProfit: true,
      skipPendingOrders: true,
      scaleType: { id: 3 }, // Fixed lot size
      active: false,
      monitorOnly: false,
      maxSlippage: 0,
      forceMinTrade: true,
      fixMasterBalanceAndEquity: 0,
      fixSlaveBalanceAndEquity: 0,
      fixedLotSize: 0.01,
      martingaleStrategy: false,
      openRetry: true,
      openRetryTimeoutInMinutes: 10,
      reverse: false,
      copyOpenPositions: false,
      maxOpenPositions: 0,
      maxLotSize: 0.0,
      maximumLot: 0.0,
      hideComment: false,
      forcePositionLotSize: false,
      ignoreContractSize: false,
      ignoreCurrency: false,
      copyMagicNumber: true,
      copyOriginalComment: false,
      customMagicNumber: parseInt(customMagic),
    };

    const response = await fetch(
      `https://api.metacopier.io/rest/api/v1/accounts/${toAccountId}/copiers`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': API_KEY,
        },
        body: JSON.stringify(copierData),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    throw error;
  }
}

async function main() {
  console.log(`\n🚀 Creating copiers for traders on ${RFX_MASTER_ACCOUNTS.length} RFX Master accounts...\n`);

  // Connect to database
  const connection = await createConnection(process.env.DATABASE_URL);

  // Query all traders with the specified live account
  const [traders] = await connection.execute(
    `SELECT id, name, magicNumber, mcAccountId 
     FROM magic_numbers 
     WHERE liveAccountNumber = ? AND mcAccountId IS NOT NULL 
     ORDER BY name`,
    [LIVE_ACCOUNT]
  );

  console.log(`Found ${traders.length} traders with live account ${LIVE_ACCOUNT}\n`);

  let totalCreated = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const masterAccount of RFX_MASTER_ACCOUNTS) {
    console.log(`\n📊 Processing: ${masterAccount.alias} (${masterAccount.login})`);
    console.log(`   Account ID: ${masterAccount.id}\n`);

    for (const trader of traders) {
      if (!trader.mcAccountId) {
        console.log(`   ⏭️  Skipped ${trader.name} (no MC account)`);
        totalSkipped++;
        continue;
      }

      try {
        await createCopier(
          masterAccount.id,
          trader.mcAccountId,
          `RFX - ${trader.name} - ${trader.magicNumber}`,
          trader.magicNumber
        );
        console.log(`   ✅ Created copier for ${trader.name} (magic: ${trader.magicNumber})`);
        totalCreated++;
      } catch (error) {
        console.error(`   ❌ Failed to create copier for ${trader.name}:`, error.message);
        totalFailed++;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  await connection.end();

  console.log(`\n\n📊 Final Summary:`);
  console.log(`   ✅ Created: ${totalCreated}`);
  console.log(`   ⏭️  Skipped: ${totalSkipped}`);
  console.log(`   ❌ Failed: ${totalFailed}`);
  console.log(`   📝 Total operations: ${totalCreated + totalSkipped + totalFailed}`);
  console.log(`   🎯 Expected: ${traders.length * RFX_MASTER_ACCOUNTS.length}\n`);
}

main().catch(console.error);
