// `generateMetadata` et non `metadata` depuis TCK-292 : le titre passe par le dictionnaire, et
// une constante statique ne peut pas appeler `getTranslations`.
export { default, generateMetadata } from '../../app/properties/(liste)/page';

// Next.js 16 Turbopack refuses re-exports for route-segment config values;
// `dynamic` must be declared statically here. Keep in sync with the source
// route `(dashboard)/app/properties/(liste)/page.tsx`.
export const dynamic = 'force-dynamic';
