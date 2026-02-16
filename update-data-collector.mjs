import axios from 'axios';
import 'dotenv/config';

const API_BASE = 'https://api.metacopier.io/rest/api/v1';
const API_KEY = process.env.METACOPIER_API_KEY;

async function fetchWithAuth(endpoint, method = 'GET', data = null) {
  try {
    const response = await axios({
      method,
      url: `${API_BASE}${endpoint}`,
      headers: {
        'X-API-KEY': API_KEY,
        'Content-Type': 'application/json',
      },
      data,
      timeout: 60000,
    });
    return response.data;
  } catch (error) {
    console.error(`Error ${method} ${endpoint}:`, error.response?.data || error.message);
    throw error;
  }
}

async function main() {
  console.log('\n📊 Fetching all MC accounts...\n');
  
  const accounts = await fetchWithAuth('/accounts', 'GET');
  console.log(`Found ${accounts.length} total accounts\n`);

  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const account of accounts) {
    const accountName = account.name || account.id;
    const features = account.features || [];
    
    // Find Data Collector feature
    const dataCollectorFeature = features.find(f => f.name === 'Data collector');
    
    if (!dataCollectorFeature) {
      console.log(`⏭️  ${accountName}: No Data Collector feature found`);
      skippedCount++;
      continue;
    }

    const currentInterval = dataCollectorFeature.settings?.intervalInSeconds;
    
    if (currentInterval === 30) {
      console.log(`✅ ${accountName}: Already set to 30 seconds`);
      skippedCount++;
      continue;
    }

    console.log(`🔄 ${accountName}: Updating from ${currentInterval}s to 30s...`);

    try {
      // Update the feature settings
      const updatedFeatures = features.map(f => {
        if (f.name === 'Data collector') {
          return {
            ...f,
            settings: {
              ...f.settings,
              intervalInSeconds: 30
            }
          };
        }
        return f;
      });

      // Update the account with new features
      await fetchWithAuth(`/accounts/${account.id}`, 'PUT', {
        ...account,
        features: updatedFeatures
      });

      console.log(`   ✅ Updated successfully`);
      updatedCount++;
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
      failedCount++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📈 Summary:');
  console.log(`   Updated: ${updatedCount}`);
  console.log(`   Skipped: ${skippedCount}`);
  console.log(`   Failed: ${failedCount}`);
  console.log('='.repeat(50) + '\n');
}

main().catch(console.error);
