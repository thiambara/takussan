export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'cancelled';

export type PaymentMethod = 'cash' | 'wave' | 'orange_money' | 'stripe' | 'bank_transfer';

export type Payment = {
  id: number;
  amount: number;
  currency: string;
  status: PaymentStatus;
  method: PaymentMethod | null;
  reference: string | null;
  payer_id: number;
  recipient_id: number;
  payable_type: string;
  payable_id: number;
  paid_at: string | null;
  created_at: string;
};
