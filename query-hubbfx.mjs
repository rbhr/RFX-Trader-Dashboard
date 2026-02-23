import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { eq } from 'drizzle-orm';
import { magicNumbers } from './drizzle/schema.ts';

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(connection);

const hubbfxTraders = await db.select({
  name: magicNumbers.name,
  magicNumber: magicNumbers.magicNumber,
  mtAccount: magicNumbers.mtAccount
})
.from(magicNumbers)
.where(eq(magicNumbers.manager, 'HubbFX'))
.orderBy(magicNumbers.name);

console.log(JSON.stringify(hubbfxTraders, null, 2));
await connection.end();
