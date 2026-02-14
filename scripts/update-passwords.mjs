import { drizzle } from 'drizzle-orm/mysql2';
import { eq } from 'drizzle-orm';
import { magicNumbers } from '../drizzle/schema.ts';
import * as bcrypt from 'bcrypt';

const db = drizzle(process.env.DATABASE_URL);

async function updatePasswords() {
  console.log('Fetching all traders...');
  const traders = await db.select().from(magicNumbers);
  
  console.log(`Found ${traders.length} traders. Updating passwords...`);
  
  for (const trader of traders) {
    // Skip admin user
    if (trader.isAdmin) {
      console.log(`Skipping admin user: ${trader.name}`);
      continue;
    }
    
    const password = trader.magicNumber;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    await db.update(magicNumbers)
      .set({ password: hashedPassword })
      .where(eq(magicNumbers.id, trader.id));
    
    console.log(`Updated password for ${trader.name} (${trader.magicNumber})`);
  }
  
  console.log('All passwords updated successfully!');
  process.exit(0);
}

updatePasswords().catch((error) => {
  console.error('Error updating passwords:', error);
  process.exit(1);
});
