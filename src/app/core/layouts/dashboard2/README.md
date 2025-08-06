# Dashboard2 Layout - Modern Angular + Tailwind CSS Dashboard

A modern, responsive dashboard layout built with Angular 17+ and Tailwind CSS. This dashboard provides a complete,
production-ready layout with clean design aesthetics and full mobile responsiveness.

## 🚀 Features

- **Fully Responsive**: Works seamlessly across desktop, tablet, and mobile devices
- **Modern Design**: Clean, professional aesthetics with Tailwind CSS
- **Dark Mode Support**: Built-in dark/light mode theming
- **Interactive Components**: Collapsible sidebar, dropdowns, notifications
- **Accessible**: WCAG compliant with proper contrast ratios and keyboard navigation
- **TypeScript**: Fully typed with interfaces and strong typing
- **Standalone Components**: Uses Angular's latest standalone component architecture
- **Lazy Loading**: Route-based code splitting for optimal performance

## 📁 File Structure

```
src/app/core/layouts/dashboard2/
├── dashboard2.component.ts              # Main layout component
├── dashboard2-routing.module.ts         # Routing configuration
├── stubs.ts                            # Stub components for all routes
├── components/
│   ├── header/
│   │   └── dashboard2-header.component.ts      # Header with navigation, profile, notifications
│   ├── sidebar/
│   │   └── dashboard2-sidebar.component.ts     # Collapsible sidebar navigation
│   ├── main/
│   │   └── dashboard2-main.component.ts        # Main content area with stats, charts
│   └── footer/
│       └── dashboard2-footer.component.ts      # Footer with links and info
└── pages/
    ├── overview/
    │   └── dashboard2-overview.component.ts    # Dashboard overview page
    ├── analytics/
    │   └── dashboard2-analytics.component.ts   # Analytics page with charts
    ├── users/
    │   ├── dashboard2-users.component.ts       # User management table
    │   ├── dashboard2-user-roles.component.ts  # User roles management
    │   └── dashboard2-user-permissions.component.ts # Permissions management
    └── (other pages as stubs in stubs.ts)
```

## 🛠 Setup Instructions

### 1. Prerequisites

Ensure you have the following installed:

- Node.js 18+
- Angular CLI 17+
- Tailwind CSS configured in your project

### 2. Integration Steps

#### Step 1: Add Route Configuration

Add the dashboard2 route to your main routing configuration:

```typescript
// app-routing.module.ts or app.routes.ts
const routes: Routes = [
  // ... other routes
  {
    path: 'dashboard2',
    loadChildren: () => import('./core/layouts/dashboard2/dashboard2.module').then(m => m.Dashboard2Module)
  }
];
```

#### Step 2: Import Required Dependencies

Ensure these dependencies are available in your project:

```typescript
// Required Angular modules (usually in app.module.ts)
import {CommonModule} from '@angular/common';
import {RouterModule} from '@angular/router';
```

#### Step 3: Tailwind CSS Configuration

Ensure your `tailwind.config.js` includes the dashboard2 files:

```javascript
module.exports = {
    content: [
        "./src/**/*.{html,ts}",
        "./src/app/core/layouts/dashboard2/**/*.{html,ts}"
    ],
    darkMode: 'class', // Enable class-based dark mode
    theme: {
        extend: {
            // Your theme extensions
        }
    }
}
```

#### Step 4: Add Global Styles (Optional)

Add these global styles to your `src/styles.css` for optimal appearance:

```css
/* Ensure proper scrolling behavior */
html {
    scroll-behavior: smooth;
}

/* Custom scrollbar for sidebar */
.custom-scrollbar::-webkit-scrollbar {
    width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgb(148 163 184 / 0.5);
    border-radius: 2px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgb(148 163 184 / 0.7);
}
```

### 3. Usage

Navigate to `/dashboard2` in your application to view the dashboard. The layout includes:

- **Header**: Logo, search, notifications, profile dropdown
- **Sidebar**: Collapsible navigation menu with sections
- **Main Area**: Welcome section, statistics cards, charts, activity feed
- **Footer**: Links and company information

## 🎨 Customization

### Color Scheme

The dashboard uses Tailwind's slate and blue color palette by default. To customize:

1. **Primary Colors**: Replace `blue-*` classes with your brand colors
2. **Background**: Modify `slate-*` classes for different background tones
3. **Dark Mode**: Update dark mode variants in component templates

### Layout Modifications

#### Sidebar Menu Items

Edit the `menuItems` array in `dashboard2-sidebar.component.ts`:

```typescript
menuItems: MenuItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'dashboard',
    route: '/dashboard2/overview'
  },
  // Add your menu items
];
```

#### Statistics Cards

Modify the `statisticsData` in `dashboard2-main.component.ts`:

```typescript
statisticsData: StatCard[] = [
  {
    id: '1',
    title: 'Your Metric',
    value: '$12,345',
    change: 5.2,
    changeType: 'increase',
    icon: 'your-icon',
    color: 'blue'
  }
];
```

### Adding New Pages

1. Create a new component in `pages/` directory
2. Add the route to `dashboard2-routing.module.ts`
3. Add menu item to sidebar configuration
4. Implement the component with consistent styling

## 🔧 Component APIs

### Dashboard2Component

**Inputs:**

- None (self-contained)

**Key Features:**

- Responsive sidebar management
- User data integration
- Notification system

### Dashboard2HeaderComponent

**Inputs:**

- `user: DashboardUser` - Current user information
- `notifications: NotificationItem[]` - Notification array
- `unreadCount: number` - Unread notification count

**Outputs:**

- `menuClick: EventEmitter<void>` - Mobile menu toggle
- `profileAction: EventEmitter<string>` - Profile dropdown actions
- `notificationAction: EventEmitter<{action: string, notificationId?: string}>` - Notification actions

### Dashboard2SidebarComponent

**Inputs:**

- `isOpen: boolean` - Sidebar open/closed state

**Outputs:**

- `toggle: EventEmitter<void>` - Sidebar toggle event

## 📱 Responsive Behavior

### Desktop (lg: 1024px+)

- Sidebar always visible (64 width units)
- Header spans full width minus sidebar
- Three-column layouts for content cards

### Tablet (md: 768px - lg: 1023px)

- Sidebar hidden by default, overlay when open
- Header spans full width
- Two-column layouts for content cards

### Mobile (sm: 640px - md: 767px)

- Sidebar hidden by default, full overlay when open
- Hamburger menu in header
- Single-column layouts
- Responsive navigation

## 🎯 Best Practices

1. **Performance**: Components use OnPush change detection where possible
2. **Accessibility**: Proper ARIA labels, keyboard navigation, color contrast
3. **Responsiveness**: Mobile-first approach with progressive enhancement
4. **Type Safety**: All data structures use TypeScript interfaces
5. **Modern Angular**: Standalone components, signals, and latest features

## 🐛 Troubleshooting

### Common Issues

1. **Sidebar not responsive**: Ensure Tailwind's responsive prefixes are working
2. **Icons not showing**: Verify SVG icons are properly embedded in templates
3. **Dark mode issues**: Check if `dark` class is properly toggled on html/body element
4. **Route not working**: Verify lazy loading imports and route configuration

### Debug Mode

Add this to any component for debug information:

```typescript
ngOnInit()
{
  if (environment.development) {
    console.log('Dashboard2 Debug:', {
      component: this.constructor.name,
      // Add relevant debug data
    });
  }
}
```

## 🚀 Production Deployment

Before deploying to production:

1. **Build optimization**: `ng build --prod`
2. **Bundle analysis**: Use `ng build --stats-json` and webpack-bundle-analyzer
3. **Performance testing**: Test on various devices and network conditions
4. **Accessibility audit**: Run lighthouse accessibility tests

## 📄 License

This dashboard layout is part of your application. Modify and distribute according to your project's license.

## 🤝 Contributing

To contribute improvements:

1. Follow the existing code style
2. Ensure all components are properly typed
3. Test responsive behavior on multiple devices
4. Add appropriate documentation
5. Follow Angular and Tailwind CSS best practices

---

**Created with:** Angular 17+ + Tailwind CSS + TypeScript
**Last Updated:** January 2024
