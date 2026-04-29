'use client';

import dynamic from 'next/dynamic';

export const LocationPickerMapLoader = dynamic(
  () => import('./LocationPickerMap').then((m) => ({ default: m.LocationPickerMap })),
  { ssr: false },
);
