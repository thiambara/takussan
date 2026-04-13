import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import {User} from "../app/core/models/api/user.model";
import firebase from "firebase/compat";


export {};

declare global {
  interface Window {
    Echo: Echo;
    Pusher: typeof Pusher
    authUser: User;
    firebaseApp: firebase.app.App

    objectToQueryString(initialObj: any): string;

    toCamelCase(initialObj: string): string;

    toSnakeCase(initialObj: string): string;

    deepCopy<T>(obj: T): T;
  }

  interface String {
    toCamelCase(): string;

    toSnakeCase(): string;
  }

  let authUser: User;
  let objectToQueryString: (initialObj: any) => string;
  let toCamelCase: (initialObj: string) => string;
  let toSnakeCase: (initialObj: string) => string;
  let deepCopy: <T>(obj: T) => T;
}

