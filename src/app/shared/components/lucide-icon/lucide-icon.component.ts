import {Component, Input} from '@angular/core';
import {CommonModule} from '@angular/common';
import {LucideAngularModule} from 'lucide-angular';

@Component({
  selector: 'app-lucide-icon',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <lucide-icon
      [img]="img"
      [class]="class"
      [size]="size"
      [strokeWidth]="strokeWidth"
      [absoluteStrokeWidth]="absoluteStrokeWidth">
    </lucide-icon>
  `
})
export class LucideIconComponent {
  @Input({required: true}) img: any;
  @Input() class: string = '';
  @Input() size?: number | string;
  @Input() strokeWidth?: number | string;
  @Input() absoluteStrokeWidth = false;
}
