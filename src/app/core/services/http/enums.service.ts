import {Injectable} from '@angular/core';
import {HttpClient} from "@angular/common/http";
import {Observable} from "rxjs";
import {environment} from "../../../../environments/environment";

@Injectable({
  providedIn: 'root'
})
export class EnumsService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {
  }

  /**
   * Get enum values by name
   * @param name - The name of the enum (e.g., 'UserRole', 'BookingStatus')
   */
  getEnumValues(name: string): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/enums?name=${name}`);
  }
}
