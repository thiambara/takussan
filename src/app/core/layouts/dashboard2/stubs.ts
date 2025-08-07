import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../../shared/components';

// Project Components
@Component({
  selector: 'app-dashboard2-active-projects',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8 border border-slate-200 dark:border-slate-700">
      <div class="text-center">
        <div class="w-16 h-16 mx-auto bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-4">
          <app-icon name="folder" [size]="12" color="text-slate-400" />
        </div>
        <h3 class="text-lg font-medium text-slate-900 dark:text-white">Active Projects</h3>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">View and manage your active projects</p>
        <button class="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors duration-200">
          Get Started
        </button>
      </div>
    </div>
  `
})
export class Dashboard2ActiveProjectsComponent { }

@Component({
  selector: 'app-dashboard2-completed-projects',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8 border border-slate-200 dark:border-slate-700">
      <div class="text-center">
        <div class="w-16 h-16 mx-auto bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-4">
          <app-icon name="check-circle" [size]="12" color="text-slate-400" />
        </div>
        <h3 class="text-lg font-medium text-slate-900 dark:text-white">Completed Projects</h3>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Browse through your completed projects</p>
        <button class="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors duration-200">
          Get Started
        </button>
      </div>
    </div>
  `
})
export class Dashboard2CompletedProjectsComponent { }

@Component({
  selector: 'app-dashboard2-archived-projects',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8 border border-slate-200 dark:border-slate-700">
      <div class="text-center">
        <div class="w-16 h-16 mx-auto bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-4">
          <app-icon name="chevron-down" [size]="12" color="text-slate-400" />
        </div>
        <h3 class="text-lg font-medium text-slate-900 dark:text-white">Archived Projects</h3>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Access your archived project history</p>
        <button class="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors duration-200">
          Get Started
        </button>
      </div>
    </div>
  `
})
export class Dashboard2ArchivedProjectsComponent { }

// Reports Component
@Component({
  selector: 'app-dashboard2-reports',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8 border border-slate-200 dark:border-slate-700">
      <div class="text-center">
        <div class="w-16 h-16 mx-auto bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-4">
          <app-icon name="document-chart-bar" [size]="12" color="text-slate-400" />
        </div>
        <h3 class="text-lg font-medium text-slate-900 dark:text-white">Reports</h3>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Generate and view detailed reports</p>
        <button class="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors duration-200">
          Get Started
        </button>
      </div>
    </div>
  `
})
export class Dashboard2ReportsComponent { }

// Settings Components
@Component({
  selector: 'app-dashboard2-general-settings',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8 border border-slate-200 dark:border-slate-700">
      <div class="text-center">
        <div class="w-16 h-16 mx-auto bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-4">
          <app-icon name="cog-6-tooth" [size]="12" color="text-slate-400" />
        </div>
        <h3 class="text-lg font-medium text-slate-900 dark:text-white">General Settings</h3>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Configure general application settings</p>
        <button class="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors duration-200">
          Get Started
        </button>
      </div>
    </div>
  `
})
export class Dashboard2GeneralSettingsComponent { }

@Component({
  selector: 'app-dashboard2-security-settings',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8 border border-slate-200 dark:border-slate-700">
      <div class="text-center">
        <div class="w-16 h-16 mx-auto bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-4">
          <app-icon name="lock-closed" [size]="12" color="text-slate-400" />
        </div>
        <h3 class="text-lg font-medium text-slate-900 dark:text-white">Security Settings</h3>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage security and authentication settings</p>
        <button class="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors duration-200">
          Get Started
        </button>
      </div>
    </div>
  `
})
export class Dashboard2SecuritySettingsComponent { }

@Component({
  selector: 'app-dashboard2-integrations',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8 border border-slate-200 dark:border-slate-700">
      <div class="text-center">
        <div class="w-16 h-16 mx-auto bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-4">
          <app-icon name="puzzle-piece" [size]="12" color="text-slate-400" />
        </div>
        <h3 class="text-lg font-medium text-slate-900 dark:text-white">Integrations</h3>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Connect with third-party services and APIs</p>
        <button class="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors duration-200">
          Get Started
        </button>
      </div>
    </div>
  `
})
export class Dashboard2IntegrationsComponent { }

// Help Component
@Component({
  selector: 'app-dashboard2-help',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8 border border-slate-200 dark:border-slate-700">
      <div class="text-center">
        <div class="w-16 h-16 mx-auto bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-4">
          <app-icon name="question-mark-circle" [size]="12" color="text-slate-400" />
        </div>
        <h3 class="text-lg font-medium text-slate-900 dark:text-white">Help & Support</h3>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Get help and support for your questions</p>
        <button class="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors duration-200">
          Get Started
        </button>
      </div>
    </div>
  `
})
export class Dashboard2HelpComponent { }
