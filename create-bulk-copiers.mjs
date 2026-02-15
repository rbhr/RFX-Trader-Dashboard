import { createConnection } from 'mysql2/promise';
import 'dotenv/config';

const API_KEY = process.env.METACOPIER_API_KEY;
const TO_ACCOUNT_ID = 'c3d6a0ef-3a3a-4f5c-9300-4b253164bc94';
const LIVE_ACCOUNT = '251974020';

async function createCopier(fromAccountId, customMagic, traderName) {
  const copierData = {
    fromAccountId: fromAccountId,
    toAccountId: TO_ACCOUNT_ID,
    multiplier: 1.0,
    copyStopLoss: true,
    copyTakeProfit: true,
    skipPendingOrders: true,
    scaleType: { id: 4 }, // No scaling
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

  try {
    const response = await fetch(
      `https://api.metacopier.io/rest/api/v1/accounts/${TO_ACCOUNT_ID}/copiers`,
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
    console.log(`✅ Created copier for ${traderName} (magic: ${customMagic})`);
    return result;
  } catch (error) {
    console.error(`❌ Failed to create copier for ${traderName}:`, error.message);
    return null;
  }
}

async function main() {
  console.log(`\n🚀 Starting bulk copier creation for live account ${LIVE_ACCOUNT}...\n`);

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

  console.log(`Found ${traders.length} traders to process\n`);

  let successCount = 0;
  let failCount = 0;

  for (const trader of traders) {
    const result = await createCopier(
      trader.mcAccountId,
      trader.magicNumber,
      trader.name
    );
    
    if (result) {
      successCount++;
    } else {
      failCount++;
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  await connection.end();

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`   📝 Total: ${traders.length}\n`);
}

main().catch(console.error);
