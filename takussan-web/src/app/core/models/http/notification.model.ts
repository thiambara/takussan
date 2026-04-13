import {BaseModelInterface} from "./base/base.model";
import {User} from "./user.model";

export interface Notification extends BaseModelInterface {
  user_id?: number;
  type?: string;
  title?: string;
  content?: string;
  reference_id?: number;
  reference_type?: string;
  is_read?: boolean;
  read_at?: string;
  is_actioned?: boolean;
  actioned_at?: string;
  delivered?: boolean;
  delivery_channel?: string;
  delivered_at?: string;

  // Relations
  user?: User;
}
