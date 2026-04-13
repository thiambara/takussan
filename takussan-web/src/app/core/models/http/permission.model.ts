import {BaseModelInterface} from "./base/base.model";
import {Role} from "./role.model";

export interface Permission extends BaseModelInterface {
  name?: string;
  code?: string;
  description?: string;

  // Relations
  roles?: Role[];
}
