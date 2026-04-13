import {BaseModelInterface} from "./base/base.model";
import {User} from "./user.model";
import {Address} from "./address.model";
import {Booking} from "./booking.model";
import {Tag} from "./tag.model";
import {Review} from "./review.model";
import {PropertyCollaborator} from "./property-collaborator.model";
import {Media} from "./media.model";
import {Agency} from "./agency.model";
import {ProprietyStatus} from "./enum-models";

export interface Property extends BaseModelInterface {
  parent_id?: number;
  user_id?: number;
  agency_id?: number;
  title?: string;
  description?: string;
  type?: string;
  status?: ProprietyStatus;
  visibility?: string;
  price?: number;
  area?: number;
  areaUnit?: string;
  position?: string;
  level?: string;
  title_type?: string;
  with_administrative_monitoring?: boolean;
  contract_type?: 'sale' | 'rent';
  servicing?: string[]; // Array of amenities
  bookings_count?: number;

  // Metadata fields (often used for bedrooms/bathrooms in this project structure)
  metadata?: {
    bedrooms?: number;
    bathrooms?: number;
    [key: string]: any;
  };

  // Relations
  user?: User;
  agency?: Agency;
  address?: Address;
  parent?: Property;
  children?: Property[];
  bookings?: Booking[];
  collaborators?: PropertyCollaborator[];
  collaborating_users?: User[];
  agent?: any;
  tags?: Tag[];
  reviews?: Review[];
  media?: Media[];
}

