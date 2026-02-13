import { drizzle } from 'drizzle-orm/mysql2';
import { magicNumbers } from '../drizzle/schema.ts';
import dotenv from 'dotenv';

dotenv.config();

const MAGIC_USERS = [
  { magicNumber: '53436', name: 'Saif', password: 'VV8UUFa3p_B-ZcY', profitShare: '0.3500' },
  { magicNumber: '841', name: 'Sonia', password: 'VV8UUFa3p_B-ZcY', profitShare: '0.3500' },
  { magicNumber: '46330', name: 'Feroz', password: 'VV8UUFa3p_B-ZcY', profitShare: '0.3500' },
  { magicNumber: '13495', name: 'Bisma', password: 'VV8UUFa3p_B-ZcY', profitShare: '0.3500' },
  { magicNumber: '7833', name: 'Ahmed', password: 'VV8UUFa3p_B-ZcY', profitShare: '0.3500' },
  { magicNumber: '56235', name: 'Melanie', password: 'VV8UUFa3p_B-ZcY', profitShare: '0.3500' },
  { magicNumber: '46347', name: 'Gulam', password: 'VV8UUFa3p_B-ZcY', profitShare: '0.3500' },
  { magicNumber: '20126', name: 'Ali', password: 'VV8UUFa3p_B-ZcY', profitShare: '0.3500' },
  { magicNumber: '25768', name: 'Kashif', password: 'VV8UUFa3p_B-ZcY', profitShare: '0.3500' },
  { magicNumber: '23356', name: 'Zeeshan', password: 'VV8UUFa3p_B-ZcY', profitShare: '0.3500' },
  { magicNumber: '54121', name: 'Sameer', password: 'VV8UUFa3p_B-ZcY', profitShare: '0.3500' },
  { magicNumber: '6653', name: 'Tarique', password: 'VV8UUFa3p_B-ZcY', profitShare: '0.3500' },
  { magicNumber: '15806', name: 'Zarab', password: 'VV8UUFa3p_B-ZcY', profitShare: '0.3500' },
  { magicNumber: '840', name: 'SoniaX', password: 'VV8UUFa3p_B-ZcY', profitShare: '0.3500' },
  { magicNumber: '6868', name: 'Richard', password: '26Be!B3tt3r', profitShare: '0.3500', showAllData: true },
  { magicNumber: '57399', name: 'Ali', password: 'VV8UUFa3p_B-ZcY', profitShare: '0.3500' },
];

async function seed() {
  const db = drizzle(process.env.DATABASE_URL);
  console.log('Seeding magic numbers...');
  for (const user of MAGIC_USERS) {
    try {
      await db.insert(magicNumbers).values({
        magicNumber: user.magicNumber,
        name: user.name,
        password: user.password,
        profitShare: user.profitShare,
        showAllData: user.showAllData || false,
        isActive: true,
      }).onDuplicateKeyUpdate({
        set: { name: user.name, password: user.password, profitShare: user.profitShare, showAllData: user.showAllData || false },
      });
      console.log(`✓ Seeded: ${user.magicNumber} (${user.name})`);
    } catch (error) {
      console.error(`✗ Failed ${user.magicNumber}:`, error.message);
    }
  }
  console.log('Complete!');
  process.exit(0);
}
seed().catch((e) => { console.error('Failed:', e); process.exit(1); });