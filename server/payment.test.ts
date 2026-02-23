import { describe, it, expect, beforeAll } from 'vitest';
import { 
  createMagicNumber, 
  getMagicNumberByNumber,
  updateMagicNumber,
  createPayment,
  getPaymentsByMagicNumberId,
  getAllPayments,
  createNotification,
  getNotificationsByMagicNumberId,
  markNotificationAsRead,
  markAllNotificationsAsRead
} from './db';

describe('Payment System Database Functions', () => {
  let testTraderId: number;

  beforeAll(async () => {
    // Check if test trader exists
    let trader = await getMagicNumberByNumber('TEST999');
    
    // Create a test trader if it doesn't exist
    if (!trader) {
      await createMagicNumber({
        magicNumber: 'TEST999',
        name: 'Test Trader',
        password: 'test123',
        profitShare: '0.3500',
        showAllData: false,
        isActive: true,
        isAdmin: false,
      });
      trader = await getMagicNumberByNumber('TEST999');
    }
    
    if (!trader) throw new Error('Test trader not found');
    testTraderId = trader.id;
  });

  it('should update USDT info for trader', async () => {
    await updateMagicNumber(testTraderId, {
      usdtAddress: 'TRX123456789ABCDEF',
      usdtNetwork: 'TRC20',
    });

    const updatedTrader = await getMagicNumberByNumber('TEST999');
    expect(updatedTrader?.usdtAddress).toBe('TRX123456789ABCDEF');
    expect(updatedTrader?.usdtNetwork).toBe('TRC20');
  });

  it('should create payment record with network fee', async () => {
    await createPayment({
      magicNumberId: testTraderId,
      amount: '100.50',
      networkFee: '1.50',
      transactionHash: '0xABCDEF123456',
      paymentDate: new Date(),
      notificationSent: true,
    });

    const payments = await getPaymentsByMagicNumberId(testTraderId);
    expect(payments.length).toBeGreaterThan(0);
    expect(parseFloat(payments[0].amount)).toBe(100.50);
    expect(parseFloat(payments[0].networkFee || '0')).toBe(1.50);
    expect(payments[0].transactionHash).toBe('0xABCDEF123456');
  });

  it('should create notification for payment', async () => {
    await createNotification({
      magicNumberId: testTraderId,
      title: 'Payment Received',
      message: 'You have received a payment of $100.50. Transaction hash: 0xABCDEF123456',
      type: 'payment',
      isRead: false,
    });

    const notifications = await getNotificationsByMagicNumberId(testTraderId);
    expect(notifications.length).toBeGreaterThan(0);
    expect(notifications[0].type).toBe('payment');
    expect(notifications[0].title).toBe('Payment Received');
    expect(notifications[0].isRead).toBe(false);
  });

  it('should mark notification as read', async () => {
    const notifications = await getNotificationsByMagicNumberId(testTraderId);
    const notificationId = notifications[0].id;

    await markNotificationAsRead(notificationId);

    const updatedNotifications = await getNotificationsByMagicNumberId(testTraderId);
    const updatedNotif = updatedNotifications.find(n => n.id === notificationId);
    expect(updatedNotif?.isRead).toBe(true);
  });

  it('should mark all notifications as read', async () => {
    // Create another notification
    await createNotification({
      magicNumberId: testTraderId,
      title: 'Test Notification',
      message: 'This is a test',
      type: 'info',
      isRead: false,
    });

    await markAllNotificationsAsRead(testTraderId);

    const notifications = await getNotificationsByMagicNumberId(testTraderId);
    const unreadCount = notifications.filter(n => !n.isRead).length;
    expect(unreadCount).toBe(0);
  });

  it('should retrieve all payments', async () => {
    const allPayments = await getAllPayments();
    expect(allPayments.length).toBeGreaterThan(0);
    
    const testPayment = allPayments.find(p => p.magicNumberId === testTraderId);
    expect(testPayment).toBeDefined();
    expect(parseFloat(testPayment!.amount)).toBe(100.50);
  });
});
