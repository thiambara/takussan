import {ApplicationConfig, LOCALE_ID, provideZoneChangeDetection} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withEnabledBlockingInitialNavigation,
  withInMemoryScrolling
} from '@angular/router';

import {routes} from './app.routes';
import {provideHttpClient, withInterceptors} from "@angular/common/http";
import {takussanApiAuthInterceptor} from "./core/interceptors/takussan-api-auth.interceptor";
import {provideAnimationsAsync} from "@angular/platform-browser/animations/async";

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes,
      withInMemoryScrolling({anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled'}),
      withEnabledBlockingInitialNavigation(),
      withComponentInputBinding()
    ),
    provideAnimationsAsync(),
    provideZoneChangeDetection({eventCoalescing: true}),
    provideHttpClient(withInterceptors([takussanApiAuthInterceptor])),
    {provide: LOCALE_ID, useValue: "fr-FR"},
  ]
};
