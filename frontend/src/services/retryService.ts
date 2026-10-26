import { syncQueueService } from './syncQueue';
import type { SyncQueueItem } from '../db/database';

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export class RetryService {
  private config: RetryConfig = {
    maxRetries: 5,
    baseDelayMs: 1000, // 1 second
    maxDelayMs: 32000  // 32 seconds
  };

  /**
   * Calculate exponential backoff delay
   * Formula: min(baseDelay * 2^retryCount, maxDelay)
   */
  calculateBackoffDelay(retryCount: number): number {
    const delay = this.config.baseDelayMs * Math.pow(2, retryCount);
    return Math.min(delay, this.config.maxDelayMs);
  }

  /**
   * Check if an item should be retried
   */
  shouldRetry(item: SyncQueueItem): boolean {
    return item.retryCount < this.config.maxRetries;
  }

  /**
   * Schedule a retry for a failed sync operation
   */
  async scheduleRetry(itemId: string): Promise<void> {
    const item = await syncQueueService.peek();
    if (!item || item.id !== itemId) {
      // Item not found or not at the front of queue
      return;
    }

    if (!this.shouldRetry(item)) {
      console.log(`Max retries (${this.config.maxRetries}) reached for item ${itemId} — moving to dead letter queue`);
      await syncQueueService.updateStatus(itemId, 'FAILED', 'Max retries exceeded');
      // Move to dead letter queue so data is never lost
      try {
        const { db } = await import('../db/database');
        await db.deadLetterQueue.add({
          id: `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          originalId: item.id,
          operation: item.operation,
          collection: item.collection,
          data: item.data,
          timestamp: item.timestamp,
          userId: item.userId,
          retryCount: item.retryCount,
          lastError: item.error || 'Max retries exceeded',
          movedAt: new Date().toISOString()
        });
        await syncQueueService.remove(itemId);
      } catch (e) {
        console.error('Failed to move item to dead letter queue:', e);
      }
      return;
    }

    // Increment retry count
    const newRetryCount = await syncQueueService.incrementRetryCount(itemId);
    
    // Calculate backoff delay
    const delay = this.calculateBackoffDelay(newRetryCount - 1);
    
    console.log(`Scheduling retry ${newRetryCount}/${this.config.maxRetries} for item ${itemId} in ${delay}ms`);

    // Reset status to PENDING after delay
    setTimeout(async () => {
      await syncQueueService.updateStatus(itemId, 'PENDING');
      console.log(`Item ${itemId} ready for retry`);
    }, delay);
  }

  /**
   * Process failed items and schedule retries
   */
  async processFailedItems(): Promise<void> {
    const allItems = await syncQueueService.getAll();
    const failedItems = allItems.filter(item => item.status === 'FAILED');

    for (const item of failedItems) {
      if (this.shouldRetry(item)) {
        await this.scheduleRetry(item.id);
      } else {
        console.log(`Item ${item.id} has exceeded max retries and will not be retried`);
      }
    }
  }

  /**
   * Update retry configuration
   */
  setConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current retry configuration
   */
  getConfig(): RetryConfig {
    return { ...this.config };
  }

  /**
   * Get retry delay for a specific retry count (for testing/display)
   */
  getRetryDelay(retryCount: number): number {
    return this.calculateBackoffDelay(retryCount);
  }

  /**
   * Get all retry delays up to max retries (for display)
   */
  getAllRetryDelays(): number[] {
    const delays: number[] = [];
    for (let i = 0; i < this.config.maxRetries; i++) {
      delays.push(this.calculateBackoffDelay(i));
    }
    return delays;
  }
}

export const retryService = new RetryService();
