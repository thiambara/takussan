import {Injectable} from '@angular/core';
import {environment} from "../../../../../environments/environment";
import {HttpClient, HttpHeaders} from "@angular/common/http";
import {Observable} from "rxjs";
import {BaseModelInterface} from "../../../models/http/base/base.model";
import {PaginationResult} from "../../../models/http/base/pagination-result.model";
import {BaseHttpIndexQueryParams} from "../../../models/http/base/base-http-index-query-param.model";

@Injectable({
  providedIn: 'root'
})
export class BaseHttpService<T extends BaseModelInterface> {

  protected apiUrl: string = `${environment.apiUrl}/api`;
  protected suffix: string = '';
  protected httpOptions = {
    headers: new HttpHeaders({
      'Content-Type': 'application/json'
    })
  };

  constructor(protected http: HttpClient) {
  }

  protected get endpointUrl(): string {
    return `${this.apiUrl}/${this.suffix}`;
  }

  setSuffix(suffix: string) {
    this.suffix = suffix;
  }

  setApiUrl(url: string) {
    this.apiUrl = url;
  }

  public index(params: BaseHttpIndexQueryParams<T> = {}): Observable<T[] | PaginationResult<T>> {
    console.log(objectToQueryString)
    return this.http.get<T[] | PaginationResult<T>>(`${this.endpointUrl}?${objectToQueryString(params)}`, this.httpOptions).pipe();
  }

  get(id: any, params: BaseHttpIndexQueryParams<T> = {}): Observable<T> {
    return this.http.get<T>(`${this.endpointUrl}/${id}?${objectToQueryString(params)}`, this.httpOptions).pipe();
  }

  create(data: T, params: BaseHttpIndexQueryParams<T> = {}): Observable<T> {
    return this.http.post<T>(`${this.endpointUrl}?${objectToQueryString(params)}`, data, this.httpOptions).pipe();
  }

  update(id: any, data: T, params: BaseHttpIndexQueryParams<T> = {}): Observable<T> {
    return this.http.put<T>(`${this.endpointUrl}/${id}?${objectToQueryString(params)}`, data, this.httpOptions).pipe();
  }

  delete(id: any, params: BaseHttpIndexQueryParams<T> = {}): Observable<T> {
    return this.http.delete<T>(`${this.endpointUrl}/${id}?${objectToQueryString(params)}`, this.httpOptions).pipe();
  }

}
