// Native menu item interface to replace PrimeNG MenuItem
export interface MenuItemNative {
  label: string;
  routerLink?: string;
  icon?: string;
  visible?: boolean;
}

export const menuItems: MenuItemNative[] = [
  {label: 'Home', icon: 'home', routerLink: 'home', visible: true},
  {label: 'Properties', icon: 'home', routerLink: 'properties', visible: true},
  {label: 'Bookings', icon: 'calendar', routerLink: 'bookings', visible: true},
  {label: 'Customers', icon: 'users', routerLink: 'customers', visible: true},
  {label: 'Reports', icon: 'chart', routerLink: 'reports', visible: true}
];
