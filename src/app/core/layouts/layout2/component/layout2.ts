import {Component} from '@angular/core';
import {RouterModule} from '@angular/router';
import {CommonModule} from '@angular/common';
import {Topbar} from "./topbar";
import {Footer} from "./footer";

@Component({
  selector: 'app-layout2',
  standalone: true,
  imports: [CommonModule, RouterModule, Topbar, Footer],
  template: `
      <div class="flex overflow-x-hidden relative flex-col min-h-screen bg-gray-50 size-full group/design-root"
           style='font-family: "Work Sans", "Noto Sans", sans-serif;'>
          <div class="flex flex-col h-full layout-container grow">

              <app-topbar></app-topbar>
              <div class="flex flex-1 justify-center px-40 py-5">
                  <div class="layout-content-container flex flex-col max-w-[960px] flex-1">
                      <router-outlet></router-outlet>
                  </div>
              </div>
              <app-footer></app-footer>
          </div>
      </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      font-family: "Work Sans", "Noto Sans", sans-serif;
    }

    .layout-container {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
  `]
})
export class Layout2 {

  constructor() {
  }
}
