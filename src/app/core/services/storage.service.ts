import {Injectable} from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class StorageService {

  public static setItemInSessionStorage(key: string, value: any): void {
    sessionStorage.setItem(key, JSON.stringify(value));
  }

  public static setItemInLocalStorage(key: string, value: any): void {
    localStorage.setItem(key, JSON.stringify(value));
  }

  public static getItemFromSessionStorage<T>(key: string): T {
    let value = sessionStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  }

  public static getItemFromLocalStorage<T>(key: string): T {
    let value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  }
}
