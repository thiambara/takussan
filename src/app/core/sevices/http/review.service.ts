import {Injectable} from '@angular/core';
import {BaseHttpService} from "./base/base-http.service";
import {Review} from "../../models/http/review.model";

@Injectable({
  providedIn: 'root'
})
export class ReviewService extends BaseHttpService<Review> {
  protected override suffix: string = 'reviews';
}
