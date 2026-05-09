export { default, metadata } from '../../app/properties/page';

// Next.js 16 Turbopack refuses re-exports for route-segment config values;
// `dynamic` must be declared statically here. Keep in sync with the source
// route `(dashboard)/app/properties/page.tsx`.
export const dynamic = 'force-dynamic';
