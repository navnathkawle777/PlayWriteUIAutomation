export interface UserRecord {
  request_id: string;
  username: string;
  password?: string;
  first_name: string;
  last_name: string;
  email: string;
  
 // user_type?: string;
  groups: string;
  roles: string;
  action: string;
  remarks?: string;
 
  // Dropdown fields
  country?: string;
  security?: string;
  division?: string;
  scheme?: string;
  // Multi-select dropdown fields (comma-separated in XLSX)
  cluster?: string;
  team?: string;
  [key: string]: any;
}

export interface ExecutionResult {
  request_id: string;
  username: string;
  action: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'VALIDATION_ERROR';
  message: string;
  screenshot_path?: string;
  trace_path?: string;
  video_path?: string;
  timestamp: string;
}

export interface ValidationError {
  request_id: string;
  field: string;
  error: string;
}