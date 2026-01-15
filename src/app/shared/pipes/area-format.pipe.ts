import {Pipe, PipeTransform} from '@angular/core';

@Pipe({
  name: 'areaFormat',
  standalone: true
})
export class AreaFormatPipe implements PipeTransform {
  transform(value: number | undefined | null, unit: string = 'm²'): string {
    if (value === undefined || value === null) return '--';
    return `${value} ${unit}`;
  }
}
