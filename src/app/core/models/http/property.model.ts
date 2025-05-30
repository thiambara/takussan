import {BaseModelInterface} from "./base/base.model";
import {User} from "./user.model";
import {Address} from "./address.model";
import {Booking} from "./booking.model";
import {Tag} from "./tag.model";
import {Review} from "./review.model";
import {PropertyCollaborator} from "./property-collaborator.model";

export interface Property extends BaseModelInterface {
  parent_id?: number;
  user_id?: number;
  title?: string;
  description?: string;
  type?: string;
  status?: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  visibility?: string;
  price?: number;
  area?: number;
  position?: string;
  level?: string;
  title_type?: string;
  with_administrative_monitoring?: boolean;
  contract_type?: string;
  servicing?: any[];
  metadata?: any;

  // Relations
  user?: User;
  address?: Address;
  parent?: Property;
  children?: Property[];
  bookings?: Booking[];
  collaborators?: PropertyCollaborator[];
  collaborating_users?: User[];
  tags?: Tag[];
  reviews?: Review[];
}

