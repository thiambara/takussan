import {HttpEvent, HttpHandlerFn, HttpRequest} from "@angular/common/http";
import {AuthService} from "../services/http/auth/auth.service";
import {environment} from "../../../environments/environment";
import {Observable} from "rxjs";

export function takussanApiAuthInterceptor(request: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> {
  const token = AuthService.authToken;
  const isRestoApiUrl = request.url.startsWith(environment.apiUrl);
  if (isRestoApiUrl && token) {
    request = request.clone({
      setHeaders: {
        Accept: 'Application/json',
        Authorization: `Bearer ${token.access_token}`,
      },
    })
  }
  return next(request);
}
