export interface AuthUser {
  id: number;
  name: string;
  email_address: string;
  role: string;
  license_status?: 'active' | null;
}

export interface DirectoryUser extends AuthUser {
  email_verified: boolean;
  protected_account: boolean;
  deletion_requested_at: string | null;
  created_at: string | null;
  last_activity_at: string | null;
}

export interface OverviewResponse {
  stats: {
    total_users: number;
    verified_users: number;
    unverified_users: number;
    new_users_30_days: number;
    active_users_30_days: number;
  };
  registrations: Array<{ month: string; users: number }>;
  recent_users: DirectoryUser[];
  licenses: { configured: boolean; message: string };
  generated_at: string;
}

export interface UsersResponse {
  admin_account: DirectoryUser;
  users: DirectoryUser[];
  pagination: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export interface AccountActionResponse {
  message: string;
  notification_sent?: boolean | null;
}

export interface DeletionRequest {
  id: number;
  name: string;
  email_address: string;
  requested_at: string | null;
}

export interface DeletionRequestsResponse {
  requests: DeletionRequest[];
  pending_count: number;
}

export interface DeletionRequestCountResponse {
  pending_count: number;
}

export interface LicensePaymentRequest {
  id: number;
  name: string;
  email_address: string | null;
  payment_method: string;
  payer_name: string;
  transaction_reference: string;
  amount: number;
  currency: string;
  status: 'pending' | 'approved' | 'rejected';
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  admin_note: string | null;
}

export interface LicensePaymentRequestsResponse {
  payments: LicensePaymentRequest[];
  pagination: { current_page: number; last_page: number; total: number };
}

export interface LicensePaymentCountResponse {
  pending_count: number;
}

export interface LoginResponse {
  user: AuthUser;
  token: string;
}
