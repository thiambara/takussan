import {BaseModelInterface} from "./base/base.model";
import {User} from "./user.model";
import {Customer} from "./customer.model";

export interface UserCustomerRelationship extends BaseModelInterface {
  user_id?: number;
  customer_id?: number;
  relationship_type?: string;
  is_primary?: boolean;
  status?: string;
  start_date?: string;
  end_date?: string;
  notes?: string;
  
  // Relations
  user?: User;
  customer?: Customer;
}
