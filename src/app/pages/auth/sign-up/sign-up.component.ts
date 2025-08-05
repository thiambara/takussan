import {Component, HostListener, OnInit} from '@angular/core';
import {CommonModule} from "@angular/common";
import {Button} from "primeng/button";
import {InputText} from "primeng/inputtext";
import {FormsModule} from "@angular/forms";
import {Password} from "primeng/password";
import {ActivatedRoute, Router, RouterLink} from "@angular/router";
import {User} from "../../../core/models/http/user.model";
import {AuthService} from "../../../core/services/http/auth/auth.service";

@Component({

  selector: 'app-sign-up',
  templateUrl: './sign-up.component.html',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    Password,
    Button,
    InputText
  ],
  standalone: true
})
export class SignUpComponent implements OnInit {
  redirectUrl: string = "/login";

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
      this.authService.signUp({...data, roles: ['vendor'], type: 'vendor'}).subscribe(() => {
        this.onRegistrationSuccess();
      });
    }
  }

  onRegistrationSuccess() {
    this.router.navigate([this.redirectUrl]).then();
  }

  @HostListener("window:keyup", ["$event"])
  keyEvent(event: KeyboardEvent) {
    if (event.key === "Enter") {
      this.signUp();
    }
  }
}
