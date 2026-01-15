import {BaseModelInterface} from "./base/base.model";
import {User} from "./user.model";

export interface ActivityLog extends BaseModelInterface {
  user_id?: number;
  loggable_id?: number;
  loggable_type?: string;
  action?: string;
  description?: string;
  changes?: any;
  ip_address?: string;
  user_agent?: string;

  // Relations
  loggable?: any;
  user?: User;
}
