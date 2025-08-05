import {MenuItem} from "primeng/api";

export const menuItems: MenuItem[] = [
  {label: 'Dashboard', routerLink: '/dashboard', icon: 'dashboard', visible: true},
  {label: 'Properties', icon: 'pi pi-fw pi-home', routerLink: ['/dashboard/properties'], visible: true},
  {label: 'Bookings', icon: 'pi pi-fw pi-home', routerLink: ['/dashboard/bookings'], visible: true},
  {label: 'Customers', icon: 'pi pi-fw pi-users', routerLink: ['/dashboard/customers'], visible: true},
  {label: 'Reports', routerLink: '/reports', icon: 'bar_chart', visible: true}
];
