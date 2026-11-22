'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { hrefDeLOnglet } from '@/lib/navigation/rapports';

/**
 * TCK-2629 (O10, fidélité a-5 au bureau) — L'ACTION DE TÊTE PAR ONGLET de « Rapports ».
 *
 * L'en-tête est celui du layout (serveur, commun aux onglets) ; le geste « Nouvelle alerte » appartient à la
 * liste de l'onglet (son formulaire, son état). La liste ENREGISTRE donc son geste auprès du fournisseur que
 * pose le layout (`useActionDOnglet`), et l'en-tête le déclenche. Sur l'onglet Alertes, « + Nouvelle alerte »
 * prend la place d'« Exporter » (maquette a-5 1280) ; partout ailleurs, « Exporter » est rendu tel quel.
 */
type Enregistrer = (geste: (() => void) | null) => void;

const ContexteEnregistrer = createContext<Enregistrer | null>(null);
const ContexteGeste = createContext<(() => void) | null>(null);

export function FournisseurDActionDOnglet({ children }: { readonly children: ReactNode }) {
  const [geste, setGeste] = useState<(() => void) | null>(null);
  // Stable : les listes qui s'enregistrent ne se re-rendent pas quand le geste change.
  const [enregistrer] = useState<Enregistrer>(() => (g: (() => void) | null) => setGeste(() => g));
  return (
    <ContexteEnregistrer.Provider value={enregistrer}>
      <ContexteGeste.Provider value={geste}>{children}</ContexteGeste.Provider>
    </ContexteEnregistrer.Provider>
  );
}

/**
 * Enregistre le geste de l'onglet (le dernier rendu, lu par une référence) ; rend `true` sous le
 * fournisseur de « Rapports » — la liste n'a alors pas de bouton à elle.
 */
export function useActionDOnglet(geste: () => void): boolean {
  const enregistrer = useContext(ContexteEnregistrer);
  const courant = useRef(geste);
  useEffect(() => {
    courant.current = geste;
  });
  useEffect(() => {
    if (!enregistrer) return;
    enregistrer(() => courant.current());
    return () => enregistrer(null);
  }, [enregistrer]);
  return enregistrer !== null;
}

export function ActionDeLOnglet({ exporter }: { readonly exporter: ReactNode }) {
  const chemin = usePathname();
  const geste = useContext(ContexteGeste);
  const t = useTranslations('rapports.alertes');
  if (chemin !== hrefDeLOnglet('alertes')) return <>{exporter}</>;
  return (
    <Button type="button" disabled={!geste} onClick={() => geste?.()}>
      <Plus aria-hidden="true" />
      {t('nouvelle')}
    </Button>
  );
}
