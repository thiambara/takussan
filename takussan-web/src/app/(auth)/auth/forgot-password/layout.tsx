import { metadonneesDePageAuth } from '../titre-d-onglet';

// TCK-906 — le titre d'onglet se pose ici (la page était `'use client'`). TCK-2606 : la page est
// désormais serveur et rend `MotDePasseOublie` ; le titre reste ici, avec ceux des autres pages d'entrée. Le
// rendu reste `<>{children}</>`, sans API de traduction dans ce fichier : transparent pour
// `check-i18n-namespaces`, il hérite du dictionnaire de `(auth)`.
export const generateMetadata = metadonneesDePageAuth('forgotPassword');

export default function Layout({ children }: { readonly children: React.ReactNode }) {
  return <>{children}</>;
}
