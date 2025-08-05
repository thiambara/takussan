import {Component, HostListener, OnInit} from '@angular/core';
import {CommonModule} from "@angular/common";
import {Checkbox} from "primeng/checkbox";
import {InputText} from "primeng/inputtext";
import {FormsModule} from "@angular/forms";
import {Password} from "primeng/password";
import {ActivatedRoute, Router, RouterLink} from "@angular/router";
import {AuthService} from "../../../core/services/http/auth/auth.service";
import {AppFloatingConfigurator} from "../../../core/layouts/dashboard/component/dashboard.floatingconfigurator";
import {Button} from "primeng/button";

@Component({

  selector: 'app-login',
  templateUrl: './login.component.html',
  imports: [
    CommonModule,
    FormsModule,
    Password,
    Checkbox,
    RouterLink,
    InputText,
    AppFloatingConfigurator,
    Button,
  ],
  standalone: true
})
export class LoginComponent implements OnInit {
  redirectUrl: string = "/";

  // credentials
  username!: string;
  password!: string;
  rememberMe: boolean = false;

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

  login() {
    const credentials = this.validatedData();
    if (credentials) {
      this.authService.login(credentials).subscribe(token => {
        this.authService.seAuthToken(token, this.rememberMe);
        this.authService.fetchAuthenticatedUser().subscribe(user => {
          this.authService.setAuthenticatedUser(user, this.rememberMe);
          this.onLoginSuccess();
        });
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
