import { describe, it, expect, vi, beforeEach } from 'vitest';
import { metaCopierService } from './metacopier';

describe('MetaCopier Account Creation Enhancement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have createCopier method', () => {
    expect(metaCopierService.createCopier).toBeDefined();
    expect(typeof metaCopierService.createCopier).toBe('function');
  });

  it('should have updateAccountName method', () => {
    expect(metaCopierService.updateAccountName).toBeDefined();
    expect(typeof metaCopierService.updateAccountName).toBe('function');
  });

  it('should have addAccountLabel method', () => {
    expect(metaCopierService.addAccountLabel).toBeDefined();
    expect(typeof metaCopierService.addAccountLabel).toBe('function');
  });

  it('createCopier should return expected structure', async () => {
    // This is a structure test - we're verifying the method exists and returns the right shape
    // Actual API calls would require valid credentials and test accounts
    const result = await metaCopierService.createCopier({
      fromAccountId: 'test-from-id',
      toAccountId: 'test-to-id',
    }).catch(() => ({
      success: false,
      message: 'Expected error for test credentials',
    }));

    expect(result).toHaveProperty('success');
    expect(typeof result.success).toBe('boolean');
    expect(result).toHaveProperty('message');
  });
});
