import {BaseModelInterface} from "./base/base.model";
import {User} from "./user.model";
import {Property} from "./property.model";

export interface Agency extends BaseModelInterface {
  name?: string;
  slug?: string;
  license_number?: string;
  email?: string;
  phone?: string;
  website?: string;
  logo_path?: string;
  description?: string;
  status?: string;
  settings?: any;
  metadata?: any;

  // Relations
  users?: User[];
  properties?: Property[];
}
