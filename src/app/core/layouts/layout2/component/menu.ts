import {Home, Building2, Calendar, Users, BarChart3} from 'lucide-angular';

// Native menu item interface to replace PrimeNG MenuItem
export interface MenuItemNative {
  label: string;
  routerLink?: string;
  icon?: any;
  visible?: boolean;
}

export const menuItems: MenuItemNative[] = [
  {label: 'Home', icon: Home, routerLink: 'home', visible: true},
  {label: 'Properties', icon: Building2, routerLink: 'properties', visible: true},
  {label: 'Bookings', icon: Calendar, routerLink: 'bookings', visible: true},
  {label: 'Customers', icon: Users, routerLink: 'customers', visible: true},
  {label: 'Reports', icon: BarChart3, routerLink: 'reports', visible: true}
];
