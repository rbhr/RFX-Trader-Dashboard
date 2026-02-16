import { metaCopierService } from './server/metacopier.ts';

async function test() {
  try {
    // Get account ID for live account 249833260
    const liveAccountId = await metaCopierService.getAccountIdByLoginNumber('249833260');
    console.log('Live Account ID:', liveAccountId);
    
    if (liveAccountId) {
      // Get copiers for this account
      const copiers = await metaCopierService.getCopiersByAccount(liveAccountId);
      console.log('Total copiers:', copiers.length);
      
      // Show first copier structure
      if (copiers.length > 0) {
        console.log('First copier structure:', JSON.stringify(copiers[0], null, 2));
      }
      
      // Find copier for magic 53436
      const traderCopier = copiers.find(c => 
        c.fromAccountShortId === 53436 || 
        c.fromAccountShortId === '53436' ||
        c.customMagicNumber === 53436 ||
        c.customMagicNumber === '53436'
      );
      console.log('Trader copier found:', !!traderCopier);
      console.log('All fromAccountShortIds:', copiers.map(c => c.fromAccountShortId));
      console.log('All customMagicNumbers:', copiers.map(c => c.customMagicNumber));
      if (traderCopier) {
        console.log('Copier details:', JSON.stringify({
          id: traderCopier.id,
          shortId: traderCopier.shortId,
          scaleType: traderCopier.scaleType,
          multiplier: traderCopier.multiplier,
          fixedLotSize: traderCopier.fixedLotSize
        }, null, 2));
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

test();
