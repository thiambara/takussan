'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { EnTeteDePage } from '@/components/navigation-publique/EnTeteDePage';
import { PartagerLaFiche } from '@/components/public/fiche/PartagerLaFiche';

export interface EnTeteDeFicheProps {
  /** Le nom de la fiche : le rappel de la rangée compacte, et le titre du partage. */
  readonly nom: string;
  /** Où mène le retour quand rien du site ne précède la fiche (lien partagé, moteur). */
  readonly repli: string;
  /** `couverture` : la couverture (boutons posés dessus). `barre` : le bloc d'identité, sous la rangée. */
  readonly children: ReactNode;
  /**
   * `couverture` (défaut, fiche d'agence) : boutons sur la photo, et rien d'autre — la photo sortie,
   * ce sont les onglets qui collent en haut (`OngletsDeFiche`, `top-0`).
   * `barre` (fiche de personne, maquette `EnTete`) : la rangée collante est toujours là, vide de titre,
   * et le rappel paraît quand l'identité (`children`) a quitté l'écran — « la page a défilé ».
   */
  readonly variante?: 'couverture' | 'barre';
  /** Le rappel de la rangée une fois l'en-tête sorti (« Biens de Sokhna G. ») ; le nom par défaut. */
  readonly rappel?: string;
}

/**
 * TCK-2522 / TCK-2523 (TCK-2568, amendement d'ADR-0091) — le haut d'une fiche AU TÉLÉPHONE, tel que
 * la maquette le montre : pas de barre du site.
 *
 * - Fiche d'agence (`couverture`, maquette FicheDBiens) : retour et partager **posés sur la
 *   couverture**, et c'est tout. La couverture sortie, les onglets collent à `top-0` et la recherche
 *   sous eux : la rangée « ← Dakar Immo » qui se fixait en plus (56 px de chrome permanent, 185 px
 *   avec la barre d'actions) a été retirée par la session le 2026-11-09.
 * - Fiche de personne (`barre`, maquette `EnTete` / `TeteFiltreeAgent`) : la rangée « ← · partager »
 *   colle à `top-0` — « le nom reste en haut, la recherche colle dessous » (`top-14`).
 *
 * En bureau, rien de cela (`EnTeteDePage` est `lg:hidden`) : la barre du site reste.
 */
export function EnTeteDeFiche({ nom, repli, children, variante = 'couverture', rappel }: EnTeteDeFicheProps) {
  const sentinelle = useRef<HTMLDivElement>(null);
  const [apresLaCouverture, setApresLaCouverture] = useState(false);

  useEffect(() => {
    const cible = sentinelle.current;
    if (variante !== 'barre' || !cible || typeof IntersectionObserver === 'undefined') return;
    // La rangée collante (56 px) couvre le haut de l'écran — ce qui passe dessous est sorti.
    const marge = 56;
    const observateur = new IntersectionObserver(
      ([entree]) => {
        setApresLaCouverture(!entree.isIntersecting && entree.boundingClientRect.top < marge);
      },
      { rootMargin: `-${marge}px 0px 0px 0px` },
    );
    observateur.observe(cible);
    return () => observateur.disconnect();
  }, [variante]);

  if (variante === 'barre') {
    return (
      <>
        {/* Bord à bord : la rangée sort de la gouttière de la page (`px-4`, `sm:px-6`) où elle est posée. */}
        <EnTeteDePage
          titre={apresLaCouverture ? (rappel ?? nom) : undefined}
          titreDeLaPage={false}
          retour={{ repli }}
          action={<PartagerLaFiche nom={nom} />}
          className="-mx-4 sm:-mx-6"
        />
        <div className="relative">
          {children}
          <div ref={sentinelle} aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px" />
        </div>
      </>
    );
  }

  return (
    <div className="relative">
      {/* AVANT la couverture : de `md` à `lg`, la variante redevient une rangée dans le flux, au-dessus. */}
      <EnTeteDePage variante="sur-photo" retour={{ repli }} action={<PartagerLaFiche nom={nom} surPhoto />} />
      {children}
    </div>
  );
}
