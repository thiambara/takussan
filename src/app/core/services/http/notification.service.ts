import {Injectable} from '@angular/core';
import {BaseHttpService} from "./base/base-http.service";
import {Notification} from "../../models/http/notification.model";

@Injectable({
  providedIn: 'root'
})
export class NotificationService extends BaseHttpService<Notification> {
  protected override suffix: string = 'notifications';
}
