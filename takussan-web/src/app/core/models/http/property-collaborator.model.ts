import {BaseModelInterface} from "./base/base.model";
import {Property} from "./property.model";
import {User} from "./user.model";

export interface PropertyCollaborator extends BaseModelInterface {
  property_id?: number;
  user_id?: number;
  role?: string;
  permissions?: string[];
  notes?: string;
  invited_by?: number;
  invitation_accepted?: boolean;
  invitation_date?: string;
  accepted_date?: string;
  
  // Relations
  property?: Property;
  user?: User;
  inviter?: User;
}
