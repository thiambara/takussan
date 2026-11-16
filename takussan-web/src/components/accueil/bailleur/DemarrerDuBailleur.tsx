'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Anneau } from '@/components/accueil/BandeauMiseEnService';
import { usePreferencesDuMenu } from '@/components/layout/contexte-preferences-du-menu';
import { etapesARendre, pieceDeLEtape, type CodeDEtape } from '@/lib/navigation/demarrer';
import { prefsDe } from '@/lib/navigation/preferences';
import { useDemarrageDeLEspace } from '@/lib/queries/demarrage-espace';
import { cn } from '@/lib/utils';

/**
 * Les étapes que l'accueil sait dire. TCK-2947 — les pièces du bailleur une à une (`piece:<code>`, TCK-2944) : la pièce
 * d'identité, le RIB, le NINEA (requis d'une société seulement) ; l'ancienne étape unique `kyc` n'est plus rendue.
 * Leur phrase ne promet rien que le code ne tienne : aucune pièce ne conditionne un reversement (décision 5a de TCK-2614).
 */
const ETAPES_DU_BAILLEUR = ['premier_bien', 'piece:cni', 'piece:rib', 'piece:ninea'] as const satisfies readonly CodeDEtape[];
type EtapeDuBailleur = (typeof ETAPES_DU_BAILLEUR)[number];

/** La clé d'une étape sous `etapes` et `enPhrase` : `premier_bien`, ou `pieces.<code>`. */
function cleDe(code: EtapeDuBailleur): string {
  const piece = pieceDeLEtape(code);
  return piece ? `pieces.${piece}` : code;
}

/**
 * TCK-2850 (maquette `app-accueil` a, e2 « Bailleur ») — « Démarrer » du bailleur sur son accueil :
 *
 *  - **téléphone** : une ligne au-dessus du salut, l'anneau, « 1/2 » et l'étape suivante (« Envoyez vos
 *    pièces d'identité »), qui MÈNE à l'étape ;
 *  - **bureau** (`large`) : le bandeau de l'en-tête, « Démarrer · 1 étape sur 2 », la phrase (« Envoyez vos
 *    pièces d'identité pour recevoir vos reversements. ») et « Continuer ».
 *
 * Une seule source avec le menu : la MÊME lecture (`useDemarrageDeLEspace`, même clé de cache) et la MÊME
 * règle (`etapesARendre(…, 'bailleur')`) que `DemarrerDeLEspace` — même étape suivante, même compte. Il
 * disparaît quand tout est fait, comme du menu, et ne rend rien pendant le chargement, sur une erreur ou
 * pour `etapes: []`.
 *
 * Décisions (TCK-2850, mineures, tranchées par l'agent) :
 *  - le masquage de « Démarrer » dans le menu (`demarrer_masque` du persona bailleur, TCK-2480) le masque
 *    aussi ici : « Masquer » vaut pour le compte, pas pour un seul montage ;
 *  - `ouverte` n'est pas passé : les deux écrans des étapes du bailleur (`/app/properties/new` par
 *    « Proposer un bien », `/app/pieces`) s'ouvrent à tout compte `owner` (catalogue du menu) ;
 *  - l'hôte n'est pas concerné : il est admin de son agence individuelle et a déjà la mise en service.
 */
export function DemarrerDuBailleur({ large = false }: { readonly large?: boolean }) {
  const t = useTranslations('accueil.bailleur.demarrer');
  const prefs = usePreferencesDuMenu();
  const masque = prefsDe(prefs.navigation, 'bailleur').demarrer_masque === true;
  const { data, isError } = useDemarrageDeLEspace({ enabled: !masque });
  const etapes = data?.data?.etapes;
  if (masque || isError || !Array.isArray(etapes)) return null;

  const { restantes, faites, total } = etapesARendre(etapes, 'bailleur');
  // Seules les étapes que l'accueil sait dire (l'API ne rend au bailleur que celles-là, TCK-2479).
  const suivante = restantes.find((e): e is typeof e & { readonly code: EtapeDuBailleur } => (ETAPES_DU_BAILLEUR as readonly string[]).includes(e.code));
  if (!suivante) return null;

  const cle = cleDe(suivante.code);
  const etape = t(`etapes.${cle}`);
  return (
    <Link
      href={suivante.href}
      data-slot="demarrer-du-bailleur"
      aria-label={t('lien', { fait: faites, total, etape })}
      className={cn(
        'flex items-center gap-2.5 rounded-xl bg-success/10 text-sm outline-none hover:bg-success/15 focus-visible:ring-3 focus-visible:ring-ring',
        large ? 'h-12 px-4' : 'mx-4 mt-3 h-11 px-3',
      )}
    >
      <Anneau fait={faites} total={total} />
      <span className="flex-none font-semibold tabular-nums text-success">
        {large ? `${t('titre')} · ${t('compteLong', { fait: faites, total })}` : `${faites}/${total}`}
      </span>
      <span className="min-w-0 flex-1 truncate text-encre-douce">
        {large ? t(`enPhrase.${cle}`) : etape}
      </span>
      {large ? <span className="flex-none text-ui font-medium text-success">{t('continuer')}</span> : null}
      <ChevronRight className="size-4 flex-none text-success" aria-hidden="true" />
    </Link>
  );
}
