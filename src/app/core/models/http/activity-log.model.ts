import {BaseModelInterface} from "./base/base.model";
import {User} from "./user.model";

export interface ActivityLog extends BaseModelInterface {
  log_name?: string;
  description?: string;
  subject_type?: string;
  subject_id?: number;
  causer_type?: string;
  causer_id?: number;
  properties?: any;
  
  // Relations
  subject?: any;
  causer?: User;
}
