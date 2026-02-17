import { metaCopierService } from './server/metacopier.ts';

const mcAccountId = '6150a6d8-d8d9-4625-88fa-2486fa909232';

try {
  console.log('Fetching account:', mcAccountId);
  const account = await metaCopierService.getAccountById(mcAccountId);
  console.log('\nAccount found:', account.alias);
  console.log('Features count:', account.features?.length || 0);
  
  if (account.features) {
    const maxOpenPosFeature = account.features.find(f => f.type?.id === 17);
    if (maxOpenPosFeature) {
      console.log('\nMax Open Positions Feature:');
      console.log(JSON.stringify(maxOpenPosFeature, null, 2));
    } else {
      console.log('\nNo Max Open Positions feature found');
    }
  }
} catch (error) {
  console.error('Error:', error.message);
}
