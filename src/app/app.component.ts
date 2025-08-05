import {Component} from '@angular/core';
import {RouterOutlet} from '@angular/router';
import {ToastComponent} from "./shared/components";

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    ToastComponent
  ],
  templateUrl: './app.component.html',
})
export class AppComponent {
  title = 'takussan-web';

  constructor() {
  }
}
