import {Component, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {RouterModule} from '@angular/router';
import {MenuItem} from 'primeng/api';
import {DashboardMenuitem} from './dashboard.menuitem';

@Component({
  selector: 'app-dashboard-menu',
  standalone: true,
  imports: [CommonModule, DashboardMenuitem, RouterModule],
  template: `
    <ul class="layout-menu">
      <ng-container *ngFor="let item of model; let i = index">
        <li app-dashboard-menuitem *ngIf="!item.separator" [item]="item" [index]="i" [root]="true"></li>
        <li *ngIf="item.separator" class="menu-separator"></li>
      </ng-container>
    </ul> `
})
export class DashboardMenu implements OnInit {
  model: MenuItem[] = [];

  ngOnInit() {
    this.model = [
      {
        items: [
          {label: 'Properties', icon: 'pi pi-fw pi-home', routerLink: ['/dashboard/properties']},
          {label: 'Customers', icon: 'pi pi-fw pi-users', routerLink: ['/dashboard/customers']}
        ]
      },
    ];
  }
}
