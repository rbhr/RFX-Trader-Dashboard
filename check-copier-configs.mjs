import { metaCopierService } from './server/metacopier.ts';

// Tarique: 22770, Sameer: 22747, Live account: 251974020
const liveAccountNumber = '251974020';

console.log('Fetching account ID for live account:', liveAccountNumber);
const accountId = await metaCopierService.getAccountIdByLoginNumber(liveAccountNumber);

if (!accountId) {
  console.log('Account not found');
  process.exit(1);
}

console.log('Account ID:', accountId);
console.log('\nFetching all copiers on this account...');

const copiers = await metaCopierService.getCopiersByAccount(accountId);

const tarique = copiers.find(c => c.fromAccountShortId === 22770);
const sameer = copiers.find(c => c.fromAccountShortId === 22747);

console.log('\n=== TARIQUE (22770) ===');
console.log(JSON.stringify(tarique, null, 2));

console.log('\n=== SAMEER (22747) ===');
console.log(JSON.stringify(sameer, null, 2));
