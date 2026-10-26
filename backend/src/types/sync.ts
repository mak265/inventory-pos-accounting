export interface SyncOperation {
  id: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  collection: string;
  data: any;
  timestamp: string;
  userId: string;
}

export interface SyncResult {
  id: string;
  success: boolean;
  serverId?: string;
  error?: string;
  conflict?: {
    localVersion: number;
    serverVersion: number;
    serverData: any;
  };
}

export interface BatchSyncRequest {
  operations: SyncOperation[];
}

export interface BatchSyncResponse {
  results: SyncResult[];
  timestamp: string;
}
