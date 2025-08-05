import {Component, HostListener, OnInit} from '@angular/core';
import {MenuItem} from 'primeng/api';
import {Router, RouterModule} from '@angular/router';
import {CommonModule} from '@angular/common';
import {StyleClassModule} from 'primeng/styleclass';
import {menuItems} from "./menu";
import {Layout2Service} from "../service/layout2.service";

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [RouterModule, CommonModule, StyleClassModule],
  template: `
      <header class="flex items-center justify-between whitespace-nowrap border-b border-solid border-b-[#eaedf1] px-10 py-3">
          <div class="flex items-center gap-4 text-[#101518]">
              <div class="size-4">
                  <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                      <path clip-rule="evenodd" d="M24 4H42V17.3333V30.6667H24V44H6V30.6667V17.3333H24V4Z"
                            fill="currentColor" fill-rule="evenodd"></path>
                  </svg>
              </div>
              <h2 class="text-[#101518] text-lg font-bold leading-tight tracking-[-0.015em]">Property Management</h2>
          </div>
          <div class="flex flex-1 gap-8 justify-end">
              <div class="hidden md:flex gap-9 items-center">
                  <ng-container *ngFor="let item of menuItems">
                      <a (click)="toggleMobileMenu()" *ngIf="item.visible"
                         [ngClass]="{'font-bold': router.isActive(item.routerLink || '', {paths: 'exact', queryParams: 'exact', fragment: 'ignored', matrixParams: 'ignored'})}"
                         [routerLink]="item.routerLink"
                         class="py-2 text-[#101518] text-sm font-medium leading-normal">
                          {{ item.label }}
                      </a>
                  </ng-container>
              </div>
              <!-- Mobile menu button (visible only on small screens) -->
              <button (click)="toggleMobileMenu()" class="md:hidden flex items-center">
                  <svg class="h-6 w-6" stroke="currentColor" viewBox="0 0 24 24"
                       xmlns="http://www.w3.org/2000/svg">
                      <path d="M4 6h16M4 12h16m-7 6h7" stroke-linecap="round" stroke-linejoin="round"
                            stroke-width="2"/>
                  </svg>
              </button>
              <div
                      class="bg-center bg-no-repeat bg-cover rounded-full aspect-square size-10"
                      style='background-image: url("https://lh3.googleusercontent.com/aida-public/AB6AXuBqwj16zEVCIlPpcERSvw-kX4uRpq59VZrB4toxPtlOsgx2yI6rKqBvcXId0_ZHX-zOdzvfTi2icV17AYRzeSvaNxbn6fVH0ivaWH2-huOg5_-l2JRK8GxGupdf12FU1ZM4aYAPgUopwYq8KFz8wz3Aw8d4INPr5cqd2TX_d9L89PG1Vu27i3r89KB0owrZtWGeulbGl8LWI8AYNgvrtzfirdrkw4zWO6froLQaMsd2iQcrQPiG1RxxB6wLg8HTKIZTH2meSJSV6iEx");'
              ></div>
          </div>
      </header>
      <!-- Mobile menu (hidden by default) -->
      <div [ngClass]="{'hidden': !isMobileMenuVisible}"
           class="md:hidden bg-white w-full py-2 border-b border-[#eaedf1] shadow-md">
          <div class="flex flex-col px-4">
              <ng-container *ngFor="let item of menuItems">
                  <a (click)="toggleMobileMenu()" *ngIf="item.visible"
                     [ngClass]="{'font-bold': router.isActive(item.routerLink || '', {paths: 'exact', queryParams: 'exact', fragment: 'ignored', matrixParams: 'ignored'})}"
                     [routerLink]="item.routerLink"
                     class="py-2 text-[#101518] text-sm font-medium leading-normal">
                      {{ item.label }}
                  </a>
              </ng-container>
          </div>
      </div>`,
  styles: [
    `
      header {
        position: sticky;
        top: 0;
        z-index: 10;
        background-color: white;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);

        @media (max-width: 768px) {
          padding: 0.75rem 1rem;
        }
      }

      // Animation for mobile menu
      .mobile-menu-enter {
        opacity: 0;
        transform: translateY(-10px);
      }

      .mobile-menu-enter-active {
        opacity: 1;
        transform: translateY(0);
        transition: opacity 200ms, transform 200ms;
      }

      .mobile-menu-exit {
        opacity: 1;
      }

      .mobile-menu-exit-active {
        opacity: 0;
        transform: translateY(-10px);
        transition: opacity 200ms, transform 200ms;
      }
    `
  ]
})
export class Topbar implements OnInit {
  menuItems: MenuItem[] = menuItems;
  isMobileMenuVisible = false;
  isMobileScreen = false;

  constructor(private layout2Service: Layout2Service, public router: Router) {
    this.layout2Service.mobileMenuVisible$.subscribe(visible => {
      this.isMobileMenuVisible = visible;
    });
  }

  @HostListener('window:resize', ['$event'])
  onResize(_: any) {
    this.checkScreenSize();
  }

  ngOnInit(): void {
    this.checkScreenSize();
  }

  toggleMobileMenu() {
    this.layout2Service.toggleMobileMenu();
  }

  checkScreenSize() {
    this.isMobileScreen = window.innerWidth < 768;
    if (!this.isMobileScreen) {
      this.layout2Service.closeMobileMenu();
    }
  }
}
