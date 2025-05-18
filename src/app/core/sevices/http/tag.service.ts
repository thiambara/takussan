import {Injectable} from '@angular/core';
import {BaseHttpService} from "./base/base-http.service";
import {Tag} from "../../models/http/tag.model";

@Injectable({
  providedIn: 'root'
})
export class TagService extends BaseHttpService<Tag> {
  protected override suffix: string = 'tags';
}
