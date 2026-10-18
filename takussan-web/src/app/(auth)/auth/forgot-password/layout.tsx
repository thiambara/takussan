import { metadonneesDePageAuth } from '../titre-d-onglet';

// TCK-906 — la page est `'use client'` : son titre d'onglet se pose ici. Le rendu reste
// `<>{children}</>`, sans API de traduction dans ce fichier : transparent pour
// `check-i18n-namespaces`, il hérite du dictionnaire de `(auth)`.
export const generateMetadata = metadonneesDePageAuth('forgotPassword');

export default function Layout({ children }: { readonly children: React.ReactNode }) {
  return <>{children}</>;
}
