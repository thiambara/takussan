import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../../../../shared/components';

@Component({
  selector: 'app-dashboard2-user-roles',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8 border border-slate-200 dark:border-slate-700">
      <div class="text-center py-12">
        <app-icon name="user-group" [size]="12" color="text-slate-300 dark:text-slate-600" />
        <h3 class="mt-2 text-sm font-medium text-slate-900 dark:text-white">User Roles</h3>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage user roles and permissions here.</p>
      </div>
    </div>
  `
})
export class Dashboard2UserRolesComponent { }
