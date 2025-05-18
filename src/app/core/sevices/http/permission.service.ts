import {Injectable} from '@angular/core';
import {BaseHttpService} from "./base/base-http.service";
import {Permission} from "../../models/http/permission.model";

@Injectable({
  providedIn: 'root'
})
export class PermissionService extends BaseHttpService<Permission> {
  protected override suffix: string = 'permissions';
}
