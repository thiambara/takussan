import {Injectable} from '@angular/core';
import {BaseHttpService} from "./base/base-http.service";
import {ActivityLog} from "../../models/http/activity-log.model";

@Injectable({
  providedIn: 'root'
})
export class ActivityLogService extends BaseHttpService<ActivityLog> {
  protected override suffix: string = 'activity-logs';
}
