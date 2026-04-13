import {Injectable} from '@angular/core';
import {BaseHttpService} from "../base/base-http.service";
import {Observable} from "rxjs";
import {StorageService} from "../../storage.service";
import {User} from "../../../models/http/user.model";

type AuthToken = {
  access_token: string,
  expires_in: number,
}

@Injectable({
  providedIn: 'root'
})
export class AuthService extends BaseHttpService<User> {

  protected override suffix: string = 'auth';

  static get authToken(): AuthToken | undefined {
    return StorageService.getItemFromLocalStorage('authToken') || StorageService.getItemFromSessionStorage('authToken');
  }

  static get isAuthenticated(): boolean {
    return !!AuthService.authToken;
  }

  get authenticatedUser(): User | undefined {
    return StorageService.getItemFromLocalStorage('authenticatedUser') || StorageService.getItemFromSessionStorage('authenticatedUser');
  }

  static getAuthenticatedUser() {
    return StorageService.getItemFromLocalStorage('authenticatedUser') || StorageService.getItemFromSessionStorage('authenticatedUser')
  }

  seAuthToken(token: AuthToken, rememberMe: boolean = false) {
    if (rememberMe) {
      StorageService.setItemInLocalStorage('authToken', token);
    } else {
      StorageService.setItemInSessionStorage('authToken', token);
    }
  }

  setAuthenticatedUser(user: User, rememberMe: boolean = false) {
    if (rememberMe) {
      StorageService.setItemInLocalStorage('authenticatedUser', user);
    } else {
      StorageService.setItemInSessionStorage('authenticatedUser', user);
    }
    window.authUser = this.authenticatedUser;
  }

  public login(credentials: { username: string, password: string }): Observable<AuthToken> {
    const c = {...credentials};
    return this.http.post<AuthToken>(`${this.endpointUrl}/login`, c, this.httpOptions).pipe();
  }

  public signUp(data: {}): Observable<AuthToken> {
    return this.http.post<AuthToken>(`${this.endpointUrl}/sign-up`, {...data}, this.httpOptions).pipe();
  }

  public fetchAuthenticatedUser(): Observable<User> {
    return this.http.get<User>(`${this.endpointUrl}/auth-user`, this.httpOptions).pipe();
  }

  public logout(): any {
    return this.http.post(`${this.endpointUrl}/logout`, {}, this.httpOptions).pipe();
  }

  public changePassword(data: any): any {
    return this.http.post(`${this.endpointUrl}/change-password`, data, this.httpOptions).pipe();
  }

  public forgotPassword(data: any): any {
    return this.http.post(`${this.endpointUrl}/forgot-password`, data, this.httpOptions).pipe();
  }

  public verifyForgotPassword(data: any): any {
    return this.http.post(`${this.endpointUrl}/verify-forgot-password`, data, this.httpOptions).pipe();
  }

  public verifyEmail(data: any): any {
    return this.http.post(`${this.endpointUrl}/verify-email`, data, this.httpOptions).pipe();
  }

  public resendVerificationEmail(data: any): any {
    return this.http.post(`${this.endpointUrl}/resend-verification-email`, data, this.httpOptions).pipe();
  }
}
