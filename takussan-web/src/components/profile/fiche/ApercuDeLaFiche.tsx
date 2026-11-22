'use client';

import { Star, Timer } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { delaiDeReponse, initiales } from '@/components/public/index/faits-de-profil';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { FaitsPublicsDeLaFiche } from '@/lib/profil/faits-publics-de-la-fiche';
import { cn } from '@/lib/utils';

/** Ce que la carte publique montre du compte — jamais le courriel (la fiche publique ne le sert pas). */
export interface CompteDeLaFiche {
  readonly nom: string;
  readonly photo: string | null;
  readonly presentation: string | null;
  readonly telephoneVerifie: boolean;
}

interface ApercuDeLaFicheProps {
  readonly compte: CompteDeLaFiche;
  readonly agence: string | null;
  /** Les libellés des langues cochées, dans l'état du formulaire (pas encore enregistré). */
  readonly langues: readonly string[];
  readonly quartiers: readonly string[];
  /** `null` : fiche pas encore listée (ou illisible) — note, délai et biens ne se devinent pas. */
  readonly faitsPublics: FaitsPublicsDeLaFiche | null;
  readonly className?: string;
}

/**
 * TCK-2862 — la carte d'agent telle que le public la voit (maquette `ApercuFiche`), recomposée de
 * l'état du formulaire (langues, quartiers, à chaque modification) et du compte (nom, photo). Note,
 * délai de réponse et biens en ligne sont ceux de la fiche publique listée ; non listée, une ligne les
 * remplace : « Visible après publication de votre fiche ».
 *
 * « WhatsApp » ne paraît que si le numéro est vérifié : la fiche publique ne publie que celui-là. Les
 * deux boutons sont une image de la carte, pas des gestes (`aria-hidden`).
 */
export function ApercuDeLaFiche({ compte, agence, langues, quartiers, faitsPublics, className }: ApercuDeLaFicheProps) {
  const t = useTranslations('profile.apercu');
  const locale = useLocale();
  const delai = faitsPublics ? delaiDeReponse(faitsPublics.delaiMinutes) : null;
  const arrondie = Math.round(faitsPublics?.note?.moyenne ?? 0);
  const sousTitre = [t('agent'), agence].filter(Boolean).join(' · ');

  return (
    <div data-slot="apercu-de-la-fiche" className={cn('rounded-2xl border border-border bg-card p-4', className)}>
      <div className="flex items-center gap-3.5">
        <Avatar className="size-14">
          {compte.photo ? <AvatarImage src={compte.photo} alt="" /> : null}
          <AvatarFallback className="text-xl">{initiales(compte.nom)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-titre-court font-semibold tracking-titre">{compte.nom}</p>
          <p className="truncate text-sm text-muted-foreground">{sousTitre}</p>
          {faitsPublics ? (
            <p className="mt-1 flex items-center gap-1.5 text-ui">
              {faitsPublics.note ? (
                <>
                  {/* Cinq étoiles, pleines jusqu'à la note arrondie (maquette `Etoiles`) ; le chiffre porte la note lue. */}
                  <span className="inline-flex items-center gap-0.5" aria-hidden="true">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star
                        key={i}
                        className={cn('size-3', i <= arrondie ? 'fill-primary text-primary' : 'text-muted-foreground')}
                        strokeWidth={1.5}
                      />
                    ))}
                  </span>
                  <span
                    className="font-semibold tabular-nums"
                    aria-label={t('noteAria', { note: formaterNote(faitsPublics.note.moyenne, locale) })}
                  >
                    {formaterNote(faitsPublics.note.moyenne, locale)}
                  </span>
                  <span className="text-muted-foreground">{t('avis', { count: faitsPublics.note.nombre })}</span>
                </>
              ) : (
                <span className="text-muted-foreground">{t('pasDAvis')}</span>
              )}
            </p>
          ) : null}
        </div>
      </div>

      <dl className="mt-4 grid gap-2 text-ui">
        {langues.length > 0 ? (
          <div className="flex gap-2">
            <dt className="w-20 flex-none text-muted-foreground">{t('langues')}</dt>
            <dd className="min-w-0 font-medium">{langues.join(' · ')}</dd>
          </div>
        ) : null}
        {quartiers.length > 0 ? (
          <div className="flex gap-2">
            <dt className="w-20 flex-none text-muted-foreground">{t('quartiers')}</dt>
            <dd className="min-w-0 font-medium">{quartiers.join(' · ')}</dd>
          </div>
        ) : null}
        {faitsPublics ? (
          <>
            <div className="flex gap-2">
              <dt className="w-20 flex-none text-muted-foreground">{t('reponse')}</dt>
              <dd className="flex items-center gap-1 font-medium">
                <Timer className="size-3.5 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                {delai ? t(`delai.${delai.unite}`, { count: delai.valeur }) : t('pasDeDelai')}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 flex-none text-muted-foreground">{t('annonces')}</dt>
              <dd className="font-medium">{t('enLigne', { count: faitsPublics.annonces })}</dd>
            </div>
          </>
        ) : null}
      </dl>

      {faitsPublics ? null : (
        <p data-slot="apercu-non-listee" className="mt-3 rounded-lg bg-muted px-3 py-2 text-ui text-muted-foreground">
          {t('nonListee')}
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2" aria-hidden="true">
        {compte.telephoneVerifie ? (
          <span className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-card text-sm font-medium">
            <IconeWhatsApp className="size-4" />
            {t('whatsapp')}
          </span>
        ) : null}
        <span
          className={cn(
            'inline-flex h-10 items-center justify-center rounded-lg bg-foreground text-sm font-medium text-background',
            compte.telephoneVerifie ? null : 'col-span-2',
          )}
        >
          {t('voirSesBiens')}
        </span>
      </div>
    </div>
  );
}

function formaterNote(moyenne: number, locale: string): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(moyenne);
}
