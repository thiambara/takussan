export type LeaseStatus = 'draft' | 'active' | 'expired' | 'terminated';

export type RentPaymentStatus = 'pending' | 'paid' | 'late' | 'cancelled';

export type Lease = {
  id: number;
  property_id: number;
  tenant_id: number;
  owner_id: number;
  start_date: string;
  end_date: string;
  rent_amount: number;
  deposit_amount: number;
  status: LeaseStatus;
  created_at: string;
};

export type RentPayment = {
  id: number;
  lease_id: number;
  due_date: string;
  paid_at: string | null;
  amount: number;
  penalty: number;
  status: RentPaymentStatus;
};
