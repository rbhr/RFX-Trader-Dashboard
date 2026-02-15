import 'dotenv/config';

const API_KEY = process.env.METACOPIER_API_KEY;
const TO_ACCOUNT_ID = 'c3d6a0ef-3a3a-4f5c-9300-4b253164bc94';

async function updateCopier(copierId, copierData) {
  try {
    const response = await fetch(
      `https://api.metacopier.io/rest/api/v1/accounts/${TO_ACCOUNT_ID}/copiers/${copierId}`,
      {
        method: 'PUT',
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
  console.log(`\n🚀 Updating all copiers to Fixed lot size (0.01)...\n`);

  // Get all copiers
  const response = await fetch(
    `https://api.metacopier.io/rest/api/v1/accounts/${TO_ACCOUNT_ID}/copiers`,
    {
      headers: { 'X-API-KEY': API_KEY },
    }
  );

  const copiers = await response.json();
  console.log(`Found ${copiers.length} copiers\n`);

  let successCount = 0;
  let failCount = 0;
  let skippedCount = 0;

  for (const copier of copiers) {
    const traderName = copier.fromAccountAlias;
    
    // Skip if already using Fixed lot size (scaleType.id === 3)
    if (copier.scaleType.id === 3) {
      console.log(`⏭️  Skipped ${traderName} (already using Fixed lot size)`);
      skippedCount++;
      continue;
    }

    // Update scaleType to Fixed lot size
    const updatedCopier = {
      ...copier,
      scaleType: { id: 3 }, // Fixed lot size
      fixedLotSize: 0.01,
    };

    try {
      await updateCopier(copier.id, updatedCopier);
      console.log(`✅ Updated ${traderName} to Fixed lot size`);
      successCount++;
    } catch (error) {
      console.error(`❌ Failed to update ${traderName}:`, error.message);
      failCount++;
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Updated: ${successCount}`);
  console.log(`   ⏭️  Skipped: ${skippedCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`   📝 Total: ${copiers.length}\n`);
}

main().catch(console.error);
