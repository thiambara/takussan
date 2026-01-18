import {Component, HostListener, OnInit} from '@angular/core';
import {Router, RouterModule} from '@angular/router';
import {CommonModule} from '@angular/common';
import {MenuItemNative, menuItems} from "./menu";
import {Layout2Service} from "../service/layout2.service";
import {LucideAngularModule, LayoutGrid, Menu} from 'lucide-angular';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [RouterModule, CommonModule, LucideAngularModule],
  template: `
      <header class="sticky top-0 z-50 shadow-sm flex items-center justify-between whitespace-nowrap border-b border-solid border-b-[#eaedf1] bg-white px-4 py-3 md:px-10">
          <div class="flex items-center gap-2 text-[#101518]">
              <lucide-icon [img]="LayoutGrid" class="w-6 h-6"></lucide-icon>
              <h2 class="text-[#101518] text-lg font-bold leading-tight tracking-[-0.015em]">Takussan</h2>
          </div>
          <div class="flex flex-1 gap-8 justify-end">
              <div class="hidden md:flex gap-9 items-center">
                  @for (item of menuItems; track item.label) {
                      @if (item.visible) {
                          <a (click)="toggleMobileMenu()"
                             [ngClass]="{'font-bold text-blue-600': router.isActive(item.routerLink || '', {paths: 'exact', queryParams: 'exact', fragment: 'ignored', matrixParams: 'ignored'})}"
                             [routerLink]="item.routerLink"
                             class="flex items-center gap-2 py-2 text-[#101518] text-sm font-medium leading-normal hover:text-blue-600 transition-colors">
                              <lucide-icon [img]="item.icon" class="w-4 h-4"></lucide-icon>
                              {{ item.label }}
                          </a>
                      }
                  }
              </div>
              <!-- Mobile menu button (visible only on small screens) -->
              <button (click)="toggleMobileMenu()" class="md:hidden flex items-center p-2 rounded-lg hover:bg-gray-100">
                  <lucide-icon [img]="MenuIcon" class="w-6 h-6"></lucide-icon>
              </button>
              <div
                      class="bg-center bg-no-repeat bg-cover rounded-full aspect-square size-10 border border-gray-200"
                      style='background-image: url("https://i.pravatar.cc/150?img=12");'
              ></div>
          </div>
      </header>
      <!-- Mobile menu (hidden by default) -->
      <div [ngClass]="{'hidden': !isMobileMenuVisible}"
           class="md:hidden bg-white w-full py-2 border-b border-[#eaedf1] shadow-md absolute top-[60px] z-50">
          <div class="flex flex-col px-4">
              @for (item of menuItems; track item.label) {
                  @if (item.visible) {
                      <a (click)="toggleMobileMenu()"
                         [ngClass]="{'font-bold text-blue-600': router.isActive(item.routerLink || '', {paths: 'exact', queryParams: 'exact', fragment: 'ignored', matrixParams: 'ignored'})}"
                         [routerLink]="item.routerLink"
                         class="flex items-center gap-3 py-3 text-[#101518] text-sm font-medium leading-normal border-b border-gray-50 last:border-none">
                          <lucide-icon [img]="item.icon" class="w-5 h-5"></lucide-icon>
                          {{ item.label }}
                      </a>
                  }
              }
          </div>
      </div>`
})
export class Topbar implements OnInit {
  menuItems: MenuItemNative[] = menuItems;
  isMobileMenuVisible = false;
  isMobileScreen = false;

  readonly LayoutGrid = LayoutGrid;
  readonly MenuIcon = Menu;

  constructor(private layout2Service: Layout2Service, public router: Router) {
    this.layout2Service.mobileMenuVisible$.subscribe({
      next: (visible) => {
        this.isMobileMenuVisible = visible;
      }
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
