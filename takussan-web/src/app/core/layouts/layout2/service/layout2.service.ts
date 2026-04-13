import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class Layout2Service {
  private mobileMenuVisibleSource = new BehaviorSubject<boolean>(false);
  mobileMenuVisible$ = this.mobileMenuVisibleSource.asObservable();

  constructor() { }

  toggleMobileMenu(): void {
    this.mobileMenuVisibleSource.next(!this.mobileMenuVisibleSource.value);
  }

  closeMobileMenu(): void {
    this.mobileMenuVisibleSource.next(false);
  }
}
