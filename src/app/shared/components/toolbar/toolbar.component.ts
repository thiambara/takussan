import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-white rounded-lg shadow-sm border p-4 mb-6">
      <div class="flex justify-between items-center">
        <div class="flex items-center gap-2">
          <ng-content select="[slot=start]"></ng-content>
        </div>
        
        <div class="flex items-center gap-2">
          <ng-content select="[slot=end]"></ng-content>
        </div>
      </div>
    </div>
  `
})
export class ToolbarComponent {}
