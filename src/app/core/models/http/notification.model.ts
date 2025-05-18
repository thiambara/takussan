import {BaseModelInterface} from "./base/base.model";

export interface Notification extends BaseModelInterface {
  type?: string;
  notifiable_type?: string;
  notifiable_id?: number;
  data?: any;
  read_at?: string;
  
  // Relations
  notifiable?: any;
}
