import {Component, HostListener, OnInit} from '@angular/core';
import {Router, RouterModule} from '@angular/router';
import {CommonModule} from '@angular/common';
import {Layout2Service} from '../service/layout2.service';
import {menuItems} from './layout2.menu';
import {MenuItem} from "primeng/api";

@Component({
  selector: 'app-layout2',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './layout2.component.html',
  styleUrls: ['./layout2.component.scss']
})
export class Layout2Component implements OnInit {
  menuItems: MenuItem[] = menuItems;
  isMobileMenuVisible = false;
  isMobileScreen = false;

  constructor(private layout2Service: Layout2Service, public router: Router) {
    this.layout2Service.mobileMenuVisible$.subscribe(visible => {
      this.isMobileMenuVisible = visible;
    });
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    this.checkScreenSize();
  }

  ngOnInit(): void {
    this.checkScreenSize();
  }

  checkScreenSize() {
    this.isMobileScreen = window.innerWidth < 768;
    if (!this.isMobileScreen) {
      this.layout2Service.closeMobileMenu();
    }
  }

  toggleMobileMenu() {
    this.layout2Service.toggleMobileMenu();
  }
}
