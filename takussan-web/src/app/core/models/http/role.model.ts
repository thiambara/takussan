import {BaseModelInterface} from "./base/base.model";
import {Permission} from "./permission.model";
import {User} from "./user.model";

export interface Role extends BaseModelInterface {
  name?: string;
  code?: string;
  description?: string;
  
  // Relations
  permissions?: Permission[];
  users?: User[];
}
