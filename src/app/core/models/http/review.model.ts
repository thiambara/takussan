import {BaseModelInterface} from "./base/base.model";
import {User} from "./user.model";

export interface Review extends BaseModelInterface {
  model_id?: number;
  model_type?: string;
  user_id?: number;
  rating?: number;
  title?: string;
  content?: string;
  is_approved?: boolean;
  approved_by?: number;
  approved_at?: string;
  reported_count?: number;

  // Relations
  user?: User;
  model?: any;
  approver?: User;
}
