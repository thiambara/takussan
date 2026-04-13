import {Component, HostListener, OnInit} from '@angular/core';

import {FormsModule} from "@angular/forms";
import {ActivatedRoute, Router, RouterLink} from "@angular/router";
import {AuthService} from "../../../core/services/http/auth/auth.service";
import {Eye, EyeOff, LayoutGrid, LucideAngularModule} from "lucide-angular";

import {switchMap} from "rxjs";

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  imports: [
    FormsModule,
    RouterLink,
    LucideAngularModule
],
  standalone: true
})
export class LoginComponent implements OnInit {
  redirectUrl: string = "/";

  // credentials
  username!: string;
  password!: string;
  rememberMe: boolean = false;
  showPassword: boolean = false;

  readonly Eye = Eye;
  readonly EyeOff = EyeOff;
  readonly LayoutGrid = LayoutGrid;

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {
  }

  ngOnInit() {
    this.redirectUrl = this.route.snapshot.paramMap.get('redirectUrl') ?? this.redirectUrl;
  }

  validatedData() {
    if (this.username && this.password) {
      return {
        username: this.username,
        password: this.password
      }
    }
    return false;
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  login() {
    const credentials = this.validatedData();
    if (credentials) {
      this.authService.login(credentials).pipe(
        switchMap(token => {
          this.authService.seAuthToken(token, this.rememberMe);
          return this.authService.fetchAuthenticatedUser();
        })
      ).subscribe({
        next: (user) => {
          this.authService.setAuthenticatedUser(user, this.rememberMe);
          this.onLoginSuccess();
        }
      });
    }
  }

  onLoginSuccess() {
    this.router.navigate([this.redirectUrl ?? '/']).then();
  }

  @HostListener("window:keyup", ["$event"])
  keyEvent(event: KeyboardEvent) {
    if (event.key === "Enter") {
      this.login();
    }
  }
}
