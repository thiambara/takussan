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
  building?: string;
  latitude?: string;
  longitude?: string;

  // Relations
  addressable?: any;
}

