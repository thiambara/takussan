// Native menu item interface to replace PrimeNG MenuItem
export interface MenuItemNative {
  label: string;
  routerLink?: string;
  icon?: string;
  visible?: boolean;
}

export const menuItems: MenuItemNative[] = [
  {label: 'Dashboard', routerLink: '/dashboard', icon: 'dashboard', visible: true},
  {label: 'Properties', icon: 'home', routerLink: '/dashboard/properties', visible: true},
  {label: 'Bookings', icon: 'calendar', routerLink: '/dashboard/bookings', visible: true},
  {label: 'Customers', icon: 'users', routerLink: '/dashboard/customers', visible: true},
  {label: 'Reports', routerLink: '/reports', icon: 'chart', visible: true}
];
