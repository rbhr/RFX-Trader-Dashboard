import { drizzle } from 'drizzle-orm/mysql2';
import { magicNumbers } from '../drizzle/schema.ts';

const db = drizzle(process.env.DATABASE_URL);

async function seedAdmin() {
  try {
    // Insert admin user
    await db.insert(magicNumbers).values({
      magicNumber: 'admin',
      name: 'Administrator',
      password: 'admin',
      isActive: true,
      isAdmin: true,
    }).onDuplicateKeyUpdate({
      set: {
        name: 'Administrator',
        password: 'admin',
        isActive: true,
        isAdmin: true,
      }
    });
    
    console.log('✅ Admin user created successfully');
    console.log('   Username: admin');
    console.log('   Password: admin');
  } catch (error) {
    console.error('❌ Error seeding admin:', error);
    process.exit(1);
  }
  process.exit(0);
}

seedAdmin();
