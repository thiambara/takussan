import {BaseModelInterface} from "./base/base.model";

export interface Address extends BaseModelInterface {
  addressable_id?: number;
  addressable_type?: string;
  address?: string;
  country?: string;
  state?: string;
  city?: string;
  district?: string;
  street?: string;
  postal_code?: string;
  building?: string;
  latitude?: number;
  longitude?: number;
  label?: string;
  type?: string;
  metadata?: any;

  // Relations
  addressable?: any;
}

