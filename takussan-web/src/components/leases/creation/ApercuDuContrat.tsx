'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ExternalLink } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { origineApi } from '@/lib/config-publique';
import { cn } from '@/lib/utils';

/**
 * TCK-2912 (AC7) — « Aperçu du contrat », la carte de la colonne de droite du bureau (maquette `app-baux`
 * a, « Création — étape 3 », `BureauACreation`).
 *
 * Le contrat est celui que l'API IMPRIMERAIT (`POST /api/leases/contract-preview`, TCK-2906 : le PDF de la
 * création, rien d'écrit) : le front n'en compose aucun article — le texte du contrat est celui du
 * gabarit de l'API. La carte le montre dans un cadre, et l'ouvre en entier dans un onglet (« Voir les 4
 * pages » de la maquette : le nombre de pages n'est pas lisible, l'API n'expose aucun en-tête).
 *
 *  · `corps` : le bail tel que la création l'enverrait, `null` tant que bien, locataire, début et
 *    loyer (ou prix) ne sont pas saisis (l'API refuserait l'aperçu comme la création) ;
 *  · au plus un appel par seconde de saisie : la demande part 1 s après la DERNIÈRE modification, et
 *    jamais deux fois pour le même corps ; une réponse dépassée par une saisie plus récente est ignorée ;
 *  · au bureau seulement (`md`, là où la colonne existe) : une colonne cachée ne demande rien ;
 *  · un refus passager (429, réseau) garde l'aperçu d'avant.
 */

/** Le délai de saisie avant d'appeler l'aperçu (« au plus une fois par seconde de saisie »). */
export const DELAI_DE_L_APERCU_MS = 1000;

type Etat =
  | { readonly forme: 'attente' }
  | { readonly forme: 'lecture'; readonly url: string | null }
  | { readonly forme: 'pret'; readonly url: string }
  | { readonly forme: 'indisponible' };

export function ApercuDuContrat({ corps, className }: { readonly corps: Record<string, unknown> | null; readonly className?: string }) {
  const t = useTranslations('lease.form.apercu');
  const locale = useLocale();
  const { token } = useAuth();
  const bureau = useMatchesMedia('(width >= 48rem)');
  const [etat, setEtat] = useState<Etat>({ forme: 'attente' });
  const derniere = useRef(0);
  const urlCourante = useRef<string | null>(null);
  const cle = corps ? JSON.stringify(corps) : null;

  useEffect(() => {
    if (!bureau || cle === null) return;
    const numero = ++derniere.current;
    const minuteur = setTimeout(() => {
      setEtat((e) => ({ forme: 'lecture', url: e.forme === 'pret' || e.forme === 'lecture' ? e.url : null }));
      void (async () => {
        try {
          const reponse = await fetch(`${origineApi()}/api/leases/contract-preview`, {
            method: 'POST',
            headers: {
              Accept: 'application/pdf',
              'Content-Type': 'application/json',
              'Accept-Language': locale,
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: cle,
          });
          if (numero !== derniere.current) return;
          if (!reponse.ok) {
            // Un refus passager garde l'aperçu d'avant ; un refus du bail (422, 403) le retire.
            setEtat((e) => (reponse.status === 429 && e.forme === 'lecture' && e.url ? { forme: 'pret', url: e.url } : { forme: 'indisponible' }));
            return;
          }
          const blob = await reponse.blob();
          if (numero !== derniere.current) return;
          const url = URL.createObjectURL(blob);
          if (urlCourante.current) URL.revokeObjectURL(urlCourante.current);
          urlCourante.current = url;
          setEtat({ forme: 'pret', url });
        } catch {
          if (numero !== derniere.current) return;
          setEtat((e) => (e.forme === 'lecture' && e.url ? { forme: 'pret', url: e.url } : { forme: 'indisponible' }));
        }
      })();
    }, DELAI_DE_L_APERCU_MS);
    return () => clearTimeout(minuteur);
  }, [bureau, cle, locale, token]);

  useEffect(
    () => () => {
      if (urlCourante.current) URL.revokeObjectURL(urlCourante.current);
    },
    [],
  );

  const url = etat.forme === 'pret' ? etat.url : etat.forme === 'lecture' ? etat.url : null;

  return (
    <section className={cn('rounded-xl border border-border bg-card p-5', className)} data-testid="apercu-du-contrat" aria-busy={etat.forme === 'lecture' ? true : undefined}>
      <h2 className="text-ui font-semibold text-muted-foreground">{t('titre')}</h2>
      {cle === null ? (
        <p className="mt-3 rounded-lg border border-dashed border-border p-4 text-ui text-muted-foreground">{t('incomplet')}</p>
      ) : url ? (
        <iframe
          key={url}
          title={t('cadre')}
          src={`${url}#toolbar=0&navpanes=0&view=FitH`}
          className="mt-3 h-96 w-full rounded-lg border border-border bg-background"
        />
      ) : etat.forme === 'indisponible' ? (
        <p className="mt-3 rounded-lg border border-dashed border-border p-4 text-ui text-muted-foreground">{t('indisponible')}</p>
      ) : (
        <Skeleton className="mt-3 h-96 w-full rounded-lg" />
      )}
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-ui font-medium text-primary hover:underline">
          {t('ouvrir')}
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      ) : null}
    </section>
  );
}
