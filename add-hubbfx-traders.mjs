import mysql from 'mysql2/promise';
import 'dotenv/config';

const traders = [
  { name: 'Amber', mtAccount: '260227844', mtServer: 'Exness-MT5Trial15', mtPassword: 'VV8UUFa3p_B-ZcY' },
  { name: 'Shadost', mtAccount: '260227848', mtServer: 'Exness-MT5Trial15', mtPassword: 'VV8UUFa3p_B-ZcY' },
  { name: 'Azra', mtAccount: '260227852', mtServer: 'Exness-MT5Trial15', mtPassword: 'VV8UUFa3p_B-ZcY' },
  { name: 'Khan', mtAccount: '260227859', mtServer: 'Exness-MT5Trial15', mtPassword: 'VV8UUFa3p_B-ZcY' },
  { name: 'Khalid', mtAccount: '260227868', mtServer: 'Exness-MT5Trial15', mtPassword: 'VV8UUUFa3p_B-ZcY' },
  { name: 'Meer', mtAccount: '260227873', mtServer: 'Exness-MT5Trial15', mtPassword: 'VV8UUFa3p_B-ZcY' },
  { name: 'Maria', mtAccount: '260227899', mtServer: 'Exness-MT5Trial15', mtPassword: 'VV8UUFa3p_B-ZcY' }
];

// Generate random 5-digit magic number
function generateMagic() {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

const connection = await mysql.createConnection(process.env.DATABASE_URL);

console.log('Adding HubbFX traders...\n');

for (const trader of traders) {
  const magic = generateMagic();
  
  try {
    await connection.execute(
      `INSERT INTO magic_numbers 
       (magicNumber, name, password, manager, mtAccount, mtServer, mtPassword, mtVersion, profitShare, showAllData, isActive, isAdmin) 
       VALUES (?, ?, ?, 'HubbFX', ?, ?, ?, 'MT5', 0.35, 0, 1, 0)`,
      [magic, trader.name, magic, trader.mtAccount, trader.mtServer, trader.mtPassword]
    );
    
    console.log(`✅ ${trader.name}: Magic ${magic}, MT5 Account ${trader.mtAccount}`);
  } catch (error) {
    console.error(`❌ Failed to add ${trader.name}:`, error.message);
  }
}

await connection.end();
console.log('\n✅ All HubbFX traders added successfully!');
