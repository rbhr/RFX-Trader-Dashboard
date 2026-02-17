import { metaCopierService } from './server/metacopier.js';

const metacopier = metaCopierService;

// Get a trader's MC account to see features structure
const accounts = await metacopier.getAccountsByLabel('RFX Trader');

if (!accounts || accounts.length === 0) {
  console.log('No accounts found with label "RFX Trader"');
  process.exit(1);
}

const accountId = accounts[0].id;
console.log('Fetching full details for account:', accountId);

const account = await metacopier.getAccountById(accountId);
console.log('\nFull account structure:', JSON.stringify(account, null, 2));

// Look for max open trades feature
const maxOpenTradesFeature = account.features?.find(f => 
  f.name?.toLowerCase().includes('max') || 
  f.name?.toLowerCase().includes('open')
);

if (maxOpenTradesFeature) {
  console.log('\n=== Max Open Trades Feature ===');
  console.log(JSON.stringify(maxOpenTradesFeature, null, 2));
} else {
  console.log('\nNo max open trades feature found.');
  console.log('All feature names:', account.features?.map(f => f.name).join(', ') || 'none');
}
