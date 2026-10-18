import { metadonneesDePageAuth } from '../titre-d-onglet';

// TCK-906 — la page est `'use client'` : son titre d'onglet se pose ici.
export const generateMetadata = metadonneesDePageAuth('login');

export default function Layout({ children }: { readonly children: React.ReactNode }) {
  return children;
}
