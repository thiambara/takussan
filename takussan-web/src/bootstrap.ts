import {environment} from "./environments/environment";
import {enableProdMode, inject} from "@angular/core";
import CryptoJS from 'crypto-js';
import {Router} from "@angular/router";
import {AuthService} from "./app/core/services/http/auth/auth.service";

export default function bootstrap() {
  toggleLogs();
  setGlobalMethods();
  customizeLocalAndSessionStorage();
}

function toggleLogs() {
  if (environment.production) {
    enableProdMode();
    window.console = (function (oldCons: Console) {
      return {
        ...oldCons,
        log: (..._) => {
        }
      };
    }(window.console));
  }
}


function setGlobalMethods() {
  window.toCamelCase = function (str: string): string {
    return str.replace(/([-_][a-z])/g, (group) => group.toUpperCase()).replace(/[-_]/g, '');
  }

  window.toSnakeCase = function (str: string): string {
    return str.replace(/\s/g, "_").replace(/([A-Z])/g, (match) => "_" + match.toLowerCase());
  }

  window.objectToQueryString = function (initialObj: any): string {
    const reducer = (obj: any, parentPrefix = null) => (prev: any, key: any) => {
      const val = obj[key];
      key = encodeURIComponent(key);
      const prefix = parentPrefix ? `${parentPrefix}[${key}]` : key;

      if (val == null || typeof val === 'function') {
        prev.push(`${prefix}=`);
        return prev;
      }

      if (['number', 'boolean', 'string'].includes(typeof val)) {
        prev.push(`${prefix}=${encodeURIComponent(val)}`);
        return prev;
      }

      prev.push(Object.keys(val).reduce(reducer(val, prefix), []).join('&'));
      return prev;
    };

    return Object.keys(initialObj).reduce(reducer(initialObj), []).join('&');
  };

  window.deepCopy = function (obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  String.prototype.toCamelCase = function (): string {
    return toCamelCase(this as string);
  }

  String.prototype.toSnakeCase = function (): string {
    return toSnakeCase(this as string);
  }

  window.authUser = AuthService.getAuthenticatedUser();
}


// customize localStorage and sessionStorage methods to encrypt data
function customizeLocalAndSessionStorage(): string {
  if (environment.production) {
    const encrypt = (data: string, onError?: ((e: any) => void)): string => {
      try {
        data = `${environment.cryptoKey}-` + data
        return CryptoJS.AES.encrypt(data, environment.cryptoKey).toString();
      } catch (e) {
        onError && onError(e);
        return '';
      }
    }

    const decrypt = (data: string, onError?: ((e?: any) => void)): string => {
      try {
        const bytes = CryptoJS.AES.decrypt(data, environment.cryptoKey);
        return bytes.toString(CryptoJS.enc.Utf8).replace(`${environment.cryptoKey}-`, '');
      } catch (e) {
        onError && onError(e);
        return '';
      }
    }

    const logout = () => {
      localStorage.clear();
      sessionStorage.clear();
      inject(Router).navigate(['/login']).then();
    }

    // OVERRIDE LOCAL STORAGE METHODS
    const lStorage = window.localStorage;
    const oldSetItem = lStorage.setItem;
    const oldGetItem = lStorage.getItem;

    lStorage.setItem = (key: string, value: string): void => {
      oldSetItem.call(lStorage, key, encrypt(value, logout));
    }

    lStorage.getItem = (key: string): string | null => {
      let value = oldGetItem.call(lStorage, key);
      return value ? decrypt(value, logout) : value;
    }

    // OVERRIDE SESSION STORAGE METHODS
    const sStorage = window.sessionStorage;
    const oldSetItemS = sStorage.setItem;
    const oldGetItemS = sStorage.getItem;

    sStorage.setItem = (key: string, value: string): void => {
      oldSetItemS.call(sStorage, key, encrypt(value, logout));
    }

    sStorage.getItem = (key: string): string | null => {
      let value = oldGetItemS.call(sStorage, key);
      return value ? decrypt(value, logout) : value;
    }
  }

  return 'localStorage and sessionStorage methods are customized';
}

