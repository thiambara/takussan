import {ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot} from "@angular/router";
import {inject} from "@angular/core";
import {AuthService} from "../services/http/auth/auth.service";

export const notAuthGuard: CanActivateFn = (_: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const router = inject(Router)

  if (AuthService.isAuthenticated) {
    router.navigate(['/']).then();
    return false;
  }

  return true;
}
