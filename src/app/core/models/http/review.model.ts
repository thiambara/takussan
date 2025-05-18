import {BaseModelInterface} from "./base/base.model";
import {User} from "./user.model";

export interface Review extends BaseModelInterface {
  user_id?: number;
  model_id?: number;
  model_type?: string;
  rating?: number;
  comment?: string;
  status?: string;
  metadata?: any;
  
  // Relations
  user?: User;
  model?: any;
}
