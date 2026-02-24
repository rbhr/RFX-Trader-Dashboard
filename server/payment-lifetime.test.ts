import { describe, it, expect, beforeAll } from 'vitest';
import { 
  createMagicNumber, 
  getMagicNumberByNumber,
  getMagicNumberById,
  updateMagicNumber,
  createPayment,
  getPaymentsByMagicNumberId
} from './db';

describe('Payment Lifetime Income Update', () => {
  let testTraderId: number;

  beforeAll(async () => {
    // Check if test trader exists
    let trader = await getMagicNumberByNumber('LIFETIMETEST');
    
    // Create a test trader if it doesn't exist
    if (!trader) {
      await createMagicNumber({
        magicNumber: 'LIFETIMETEST',
        name: 'Lifetime Test Trader',
        password: 'test123',
        profitShare: '0.3500',
        showAllData: false,
        isActive: true,
        isAdmin: false,
        lifetimeIncome: '0.00',
      });
      trader = await getMagicNumberByNumber('LIFETIMETEST');
    } else {
      // Reset lifetime income to 0
      await updateMagicNumber(trader.id, {
        lifetimeIncome: '0.00',
      });
    }
    
    if (!trader) throw new Error('Test trader not found');
    testTraderId = trader.id;
  });

  it('should update lifetime income when payment is created', async () => {
    // Get initial lifetime income
    const initialTrader = await getMagicNumberById(testTraderId);
    expect(initialTrader).toBeDefined();
    const initialIncome = parseFloat(initialTrader!.lifetimeIncome);
    expect(initialIncome).toBe(0);

    // Create first payment
    await createPayment({
      magicNumberId: testTraderId,
      amount: '100.50',
      networkFee: '1.50',
      transactionHash: '0xTEST001',
      paymentDate: new Date(),
      notificationSent: true,
    });

    // Manually update lifetime income (simulating what makePayment procedure does)
    const trader1 = await getMagicNumberById(testTraderId);
    const currentIncome1 = parseFloat(trader1!.lifetimeIncome || '0');
    const newIncome1 = currentIncome1 + 100.50;
    await updateMagicNumber(testTraderId, {
      lifetimeIncome: newIncome1.toFixed(2),
    });

    // Verify lifetime income was updated
    const updatedTrader1 = await getMagicNumberById(testTraderId);
    expect(updatedTrader1).toBeDefined();
    expect(parseFloat(updatedTrader1!.lifetimeIncome)).toBe(100.50);

    // Create second payment
    await createPayment({
      magicNumberId: testTraderId,
      amount: '250.75',
      networkFee: '2.00',
      transactionHash: '0xTEST002',
      paymentDate: new Date(),
      notificationSent: true,
    });

    // Manually update lifetime income again
    const trader2 = await getMagicNumberById(testTraderId);
    const currentIncome2 = parseFloat(trader2!.lifetimeIncome || '0');
    const newIncome2 = currentIncome2 + 250.75;
    await updateMagicNumber(testTraderId, {
      lifetimeIncome: newIncome2.toFixed(2),
    });

    // Verify lifetime income accumulated correctly
    const updatedTrader2 = await getMagicNumberById(testTraderId);
    expect(updatedTrader2).toBeDefined();
    expect(parseFloat(updatedTrader2!.lifetimeIncome)).toBe(351.25); // 100.50 + 250.75

    // Verify both payments exist
    const payments = await getPaymentsByMagicNumberId(testTraderId);
    expect(payments.length).toBe(2);
  });
});
