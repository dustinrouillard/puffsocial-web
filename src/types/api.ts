export interface APIResponse<T> {
  data: T;
  error?: {
    code: string;
    message?: string;
    issues?: any;
  },
  success: boolean;
}

export interface APIGroup {
  group_id: string;
  member_count: number;
  name: string;
  visibility: string;
  state: string;
}

export interface DeviceInformation {
  id: string;
  name: string;
  uid: string;
  totalDabs: number;
  owner: string;
}

export interface DeviceLeaderboard {
  device_birthday: string;
  device_id: string;
  device_name: string;
  id: string;
  owner_name: string;
  total_dabs: number;
  last_active: string;
}
