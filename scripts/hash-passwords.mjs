import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { magicNumbers } from "../drizzle/schema.ts";
import bcrypt from "bcrypt";

const BCRYPT_ROUNDS = 12;
const db = drizzle(process.env.DATABASE_URL);

async function hashAllPasswords() {
  console.log("Fetching all traders...");
  const traders = await db.select().from(magicNumbers);

  let hashed = 0;
  let skipped = 0;

  for (const trader of traders) {
    if (
      trader.password.startsWith("$2b$") ||
      trader.password.startsWith("$2a$")
    ) {
      console.log(`  [skip] ${trader.name} — already hashed`);
      skipped++;
      continue;
    }

    const hashedPassword = await bcrypt.hash(trader.password, BCRYPT_ROUNDS);
    await db
      .update(magicNumbers)
      .set({ password: hashedPassword })
      .where(eq(magicNumbers.id, trader.id));

    console.log(`  [hash] ${trader.name} (${trader.magicNumber})`);
    hashed++;
  }

  console.log(
    `\nDone. Hashed: ${hashed}, Already hashed: ${skipped}, Total: ${traders.length}`
  );
  process.exit(0);
}

hashAllPasswords().catch((error) => {
  console.error("Error hashing passwords:", error);
  process.exit(1);
});
