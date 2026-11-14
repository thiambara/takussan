'use client';

import { useTranslations } from 'next-intl';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { CalendarDays, ClipboardCheck, Coins, EyeOff, Gauge, Star, Wrench, type LucideIcon } from 'lucide-react';

import type { ValeursDeLaFiche } from '@/lib/agence/fiche';
import { composerMenu } from '@/lib/navigation/composer-menu';
import { CODES_DE_MODULE, MODULES_D_AGENCE, type CodeDeModule } from '@/lib/navigation/modules';
import { reglagesDeLaFiche } from '@/lib/schemas/agency';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

import { useFiche } from './contexte';
import { CadreDApercu, TitreDeSection } from './pieces';

/** Les icônes des six modules (TCK-2644 : `move_in_follow_up` retiré), celles de la maquette (`app-identite-agence`, « Menu de l'équipe »). */
const ICONES: Readonly<Record<CodeDeModule, LucideIcon>> = {
  commissions: Coins,
  inventories: ClipboardCheck,
  provider_book: Wrench,
  calendar: CalendarDays,
  credits: Star,
  analytics: Gauge,
};

/**
 * TCK-2670 — « Menu de l'équipe » (TCK-2483) : les six modules, cochés = affichés. Un réglage
 * d'AFFICHAGE : aucun droit ne change. L'aperçu compose le menu d'un agent avec la saisie en cours.
 */
export function SectionMenu() {
  const t = useTranslations('admin.agencyConfig.modules');
  const tFiche = useTranslations('admin.agencyConfig.fiche.menu');
  const { agence } = useFiche();
  const { control } = useFormContext<ValeursDeLaFiche>();
  const enregistres = new Set(reglagesDeLaFiche(agence.settings).hidden_modules);

  return (
    <section aria-labelledby="titre-section-menu" data-section="menu">
      <TitreDeSection id="titre-section-menu" titre={tFiche('titre')} texte={t('description')} />
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:gap-6">
        <Controller
          control={control}
          name="hidden_modules"
          render={({ field }) => (
            <div className="min-w-0 flex-1">
              <div className="mb-2.5 flex items-baseline justify-between gap-3">
                <h3 id="titre-modules-affiches" className="text-corps font-semibold">
                  {tFiche('modulesAffiches')}
                </h3>
                <p className="text-ui tabular-nums text-muted-foreground">
                  {tFiche('compteAffiches', { n: CODES_DE_MODULE.filter((c) => !field.value.includes(c)).length, total: CODES_DE_MODULE.length })}
                </p>
              </div>
              <ul className="divide-y divide-border/70 rounded-xl border border-border bg-card" aria-labelledby="titre-modules-affiches">
                {CODES_DE_MODULE.map((code) => {
                  const id = `module-${code}`;
                  const affiche = !field.value.includes(code);
                  const modifie = affiche === enregistres.has(code);
                  const Icone = ICONES[code];
                  return (
                    <li key={code} className={cn(!affiche && 'bg-secondary/40')}>
                      <label htmlFor={id} className="flex min-h-[3.75rem] cursor-pointer items-center gap-3 px-3.5 py-2.5">
                        {/* La case de la partie connectée (`ui/checkbox`, ADR-0106 § 2 c : 18 px, la valeur
                            majoritaire des maquettes) — la maquette de cet écran en dessine une de 22 px. */}
                        <Checkbox
                          id={id}
                          checked={affiche}
                          aria-describedby={`${id}-aide`}
                          onCheckedChange={(coche) => field.onChange(coche ? field.value.filter((c) => c !== code) : [...field.value, code])}
                          onBlur={field.onBlur}
                          className="flex-none cursor-pointer"
                        />
                        <Icone className="size-icone flex-none text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2 text-corps font-medium">
                            {t(`items.${code}.label`)}
                            {modifie ? (
                              <span className="rounded-full bg-secondary px-1.5 py-px text-legende font-medium text-primary-deep">
                                {tFiche('modifie')}
                              </span>
                            ) : null}
                          </span>
                          <span id={`${id}-aide`} className="block text-pretty text-ui leading-snug text-muted-foreground">
                            {t(`items.${code}.hint`)}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        />
        <div className="w-full flex-none xl:w-80">
          <ApercuDuMenu />
        </div>
      </div>
    </section>
  );
}

/**
 * Le menu d'un agent de l'agence, composé par la règle du produit (`composerMenu`) avec les modules
 * de la saisie en cours : une entrée masquée se barre, les entrées réglables portent leur point.
 */
function ApercuDuMenu() {
  const tFiche = useTranslations('admin.agencyConfig.fiche.menu');
  const tNav = useTranslations('nav.sidebar');
  const tAdmin = useTranslations('nav.admin');
  const { control } = useFormContext<ValeursDeLaFiche>();
  const masques = useWatch({ control, name: 'hidden_modules' }) ?? [];
  const reglables = new Set<string>(CODES_DE_MODULE.flatMap((c) => MODULES_D_AGENCE[c]));
  const masquees = new Set<string>(masques.flatMap((c) => MODULES_D_AGENCE[c]));
  // Le menu SANS masque : une entrée masquée y reste, barrée — c'est ce que l'aperçu doit montrer.
  const menu = composerMenu({ roles: ['agent'], capacites: [] }, 'agent');

  return (
    <CadreDApercu titre={tFiche('apercu')}>
      <div className="rounded-xl border border-border bg-muted/45 p-2.5">
        {menu.groupes.map((groupe) => (
          <div key={groupe.id} className="mb-2 last:mb-0">
            {groupe.titre !== null ? (
              <p className="px-2 pb-0.5 text-xs text-muted-foreground">{tNav(`groupes.${groupe.titre}`, groupe.titreValeurs)}</p>
            ) : null}
            {groupe.entrees.map((entree) => {
              const masquee = masquees.has(entree.id);
              const libelle = entree.labelSpace === 'nav.admin' ? tAdmin(entree.labelKey) : tNav(entree.labelKey);
              return (
                <p
                  key={entree.href}
                  className={cn(
                    'flex h-8 items-center gap-2 rounded-lg px-2 text-ui',
                    masquee ? 'text-muted-foreground line-through' : 'text-encre-douce',
                  )}
                >
                  <span
                    className={cn('size-1.5 flex-none rounded-full', reglables.has(entree.id) && !masquee ? 'bg-primary' : 'bg-transparent')}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">{libelle}</span>
                  {masquee ? <EyeOff className="size-3.5 flex-none" role="img" aria-label={tFiche('masque')} /> : null}
                </p>
              );
            })}
          </div>
        ))}
      </div>
    </CadreDApercu>
  );
}
