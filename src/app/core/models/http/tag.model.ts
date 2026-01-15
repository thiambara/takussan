import {BaseModelInterface} from "./base/base.model";

export interface Tag extends BaseModelInterface {
  name?: string;
  slug?: string;
  description?: string;
  type?: string;
  color?: string;
}
