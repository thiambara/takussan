import {Injectable} from '@angular/core';
import {BaseHttpService} from "./base/base-http.service";
import {Role} from "../../models/http/role.model";

@Injectable({
  providedIn: 'root'
})
export class RoleService extends BaseHttpService<Role> {
  protected override suffix: string = 'roles';
}
