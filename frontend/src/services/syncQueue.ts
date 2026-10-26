import { db, type SyncQueueItem } from '../db/database';
import { v4 as uuidv4 } from 'uuid';

export class SyncQueueService {
  /**
   * Add an operation to the sync queue
   */
  async enqueue(
    operation: 'CREATE' | 'UPDATE' | 'DELETE',
    collection: string,
    data: any,
    userId: string
  ): Promise<string> {
    const queueItem: SyncQueueItem = {
      id: uuidv4(),
      operation,
      collection,
      data,
      timestamp: new Date().toISOString(),
      userId,
      status: 'PENDING',
      retryCount: 0
    };

    await db.syncQueue.add(queueItem);
    return queueItem.id;
  }

  /**
   * Get the next pending item from the queue (oldest first)
   */
  async dequeue(): Promise<SyncQueueItem | undefined> {
    const items = await db.syncQueue
      .where('status')
      .equals('PENDING')
      .sortBy('timestamp');

    return items[0];
  }

  /**
   * Peek at the next item without removing it
   */
  async peek(): Promise<SyncQueueItem | undefined> {
    return this.dequeue();
  }

  /**
   * Get all pending items in chronological order
   */
  async getAllPending(): Promise<SyncQueueItem[]> {
    return await db.syncQueue
      .where('status')
      .equals('PENDING')
      .sortBy('timestamp');
  }

  /**
   * Update the status of a queue item
   */
  async updateStatus(
    id: string,
    status: 'PENDING' | 'SYNCING' | 'COMPLETED' | 'FAILED',
    error?: string
  ): Promise<void> {
    const updates: Partial<SyncQueueItem> = { status };
    if (error) {
      updates.error = error;
    }
    await db.syncQueue.update(id, updates);
  }

  /**
   * Increment retry count for a queue item
   */
  async incrementRetryCount(id: string): Promise<number> {
    const item = await db.syncQueue.get(id);
    if (!item) throw new Error(`Queue item ${id} not found`);

    const newRetryCount = item.retryCount + 1;
    await db.syncQueue.update(id, { retryCount: newRetryCount });
    return newRetryCount;
  }

  /**
   * Remove a completed item from the queue
   */
  async remove(id: string): Promise<void> {
    await db.syncQueue.delete(id);
  }

  /**
   * Get count of pending items
   */
  async getPendingCount(): Promise<number> {
    return await db.syncQueue
      .where('status')
      .equals('PENDING')
      .count();
  }

  /**
   * Get count of failed items
   */
  async getFailedCount(): Promise<number> {
    return await db.syncQueue
      .where('status')
      .equals('FAILED')
      .count();
  }

  /**
   * Clear all completed items from the queue
   */
  async clearCompleted(): Promise<void> {
    await db.syncQueue
      .where('status')
      .equals('COMPLETED')
      .delete();
  }

  /**
   * Reset failed items back to pending for retry
   */
  async resetFailed(): Promise<void> {
    const failedItems = await db.syncQueue
      .where('status')
      .equals('FAILED')
      .toArray();

    for (const item of failedItems) {
      await db.syncQueue.update(item.id, {
        status: 'PENDING',
        error: undefined
      });
    }
  }

  /**
   * Get all items (for debugging/admin purposes)
   */
  async getAll(): Promise<SyncQueueItem[]> {
    return await db.syncQueue.toArray();
  }

  /**
   * Clear entire queue (use with caution!)
   */
  async clearAll(): Promise<void> {
    await db.syncQueue.clear();
  }
}

// Export singleton instance
export const syncQueueService = new SyncQueueService();
