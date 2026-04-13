import {Component, HostListener, OnInit} from '@angular/core';

import {FormsModule} from "@angular/forms";
import {ActivatedRoute, Router, RouterLink} from "@angular/router";
import {User} from "../../../core/models/http/user.model";
import {AuthService} from "../../../core/services/http/auth/auth.service";
import {Eye, EyeOff, LayoutGrid, LucideAngularModule} from "lucide-angular";

@Component({

  selector: 'app-sign-up',
  templateUrl: './sign-up.component.html',
  imports: [
    FormsModule,
    RouterLink,
    LucideAngularModule
],
  standalone: true
})
export class SignUpComponent implements OnInit {
  redirectUrl: string = "/login";
  showPassword: boolean = false;
  showPasswordConfirmation: boolean = false;

  readonly Eye = Eye;
  readonly EyeOff = EyeOff;
  readonly LayoutGrid = LayoutGrid;

  user: User & { passwordConfirmation: string } = {
    first_name: '',
    last_name: '',
    username: '',
    email: '',
    password: '',
    passwordConfirmation: ''
  };

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
    if (
      this.user.username
      && this.user.password
      && this.user.passwordConfirmation === this.user.password
    ) {
      return this.user
    }
    return false;
  }

  signUp() {
    const data = this.validatedData();
    if (data) {
      this.authService.signUp({...data, roles: ['vendor'], type: 'vendor'}).subscribe({
        next: () => {
          this.onRegistrationSuccess();
        }
      });
    }
  }

  onRegistrationSuccess() {
    this.router.navigate([this.redirectUrl]).then();
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  togglePasswordConfirmationVisibility() {
    this.showPasswordConfirmation = !this.showPasswordConfirmation;
  }

  @HostListener("window:keyup", ["$event"])
  keyEvent(event: KeyboardEvent) {
    if (event.key === "Enter") {
      this.signUp();
    }
  }
}
