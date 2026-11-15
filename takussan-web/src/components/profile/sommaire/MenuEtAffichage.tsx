'use client';

import { useId } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { usePreferencesDuMenu } from '@/components/layout/PreferencesDuMenu';
import { ProfileTimezoneSection } from '@/components/profile/ProfileTimezoneSection';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useChangementDeLangue } from '@/hooks/useChangementDeLangue';
import { LOCALES, localeDisplayLabel, type Locale } from '@/i18n/config';
import type { ModeIcones } from '@/lib/navigation/mode-icones';
import { estParDefaut, prefsDe } from '@/lib/navigation/preferences';
import { cn } from '@/lib/utils';

/** L'ordre de la maquette : Automatique · Complète · Icônes. */
const MODES: readonly ModeIcones[] = ['auto', 'complet', 'icones'];

interface MenuEtAffichageProps {
  /** Le fuseau du compte (`users.timezone`). */
  readonly timezone?: string | null;
}

/**
 * TCK-2635 — « Menu et affichage » de la vue d'ensemble, au bureau (maquette `ASommaireBureau`) : une
 * carte à filets — la barre latérale sur cet appareil (contrôle segmenté), le menu par défaut, puis la
 * langue et le fuseau côte à côte. Les mêmes gestes que leurs pages (`/app/profile/menu`, `language`,
 * `timezone`) : le mode et la langue s'appliquent au choix ; le fuseau, seul sélecteur de la carte,
 * s'enregistre au choix lui aussi (sur sa page, il garde son « Enregistrer »).
 *
 * Hors de la coque (aucun fournisseur des préférences du menu), les deux premières rangées se taisent ;
 * la langue et le fuseau restent.
 */
export function MenuEtAffichage({ timezone }: MenuEtAffichageProps) {
  const t = useTranslations('profile.menu');
  const tSommaire = useTranslations('profile.sommaire');
  const prefs = usePreferencesDuMenu();
  const locale = useLocale() as Locale;
  const langue = useChangementDeLangue({ remplacer: true });
  const idTitre = useId();
  const idMode = useId();
  const idLangue = useId();
  const persona = prefs.actif ? prefs.persona : null;
  const parDefaut = persona === null ? true : estParDefaut(prefsDe(prefs.navigation, persona));
  const langues = LOCALES.map((code) => ({ value: code, label: localeDisplayLabel(code, code) }));

  return (
    <section aria-labelledby={idTitre}>
      <h2 id={idTitre} className="mb-2 text-corps font-semibold">
        {tSommaire('rangees.menu')}
      </h2>
      <div className="divide-y divide-border/70 rounded-xl border border-border bg-card">
        {persona !== null ? (
          <>
            <div className="flex items-center gap-3 px-4 py-3">
              <p id={idMode} className="min-w-0 flex-1 text-sm font-medium">
                {t('appareil.label')}
              </p>
              <div role="radiogroup" aria-labelledby={idMode} className="flex rounded-lg bg-muted p-0.5 text-ui font-medium">
                {MODES.map((mode) => {
                  const choisi = prefs.modeIcones === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={choisi}
                      onClick={() => prefs.choisirModeIcones(mode)}
                      className={cn(
                        'rounded-md px-3 py-1.5 outline-none focus-visible:ring-3 focus-visible:ring-ring',
                        choisi ? 'bg-card shadow-sm' : 'text-muted-foreground',
                      )}
                    >
                      {t(`appareil.court.${mode}`)}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t('titre')}</p>
                <p className="text-ui text-muted-foreground">{t('aide')}</p>
                {/* L'état, annoncé quand le geste le change (revue de TCK-2480). */}
                <p role="status" className="sr-only">
                  {parDefaut ? t('dejaParDefaut') : t('personnalise')}
                </p>
              </div>
              {/* `aria-disabled` et non `disabled`, comme `ProfileMenuSection` : le focus reste. */}
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-disabled={parDefaut || undefined}
                onClick={parDefaut ? undefined : () => prefs.reinitialiser(persona)}
                className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              >
                {t('reinitialiser')}
              </Button>
            </div>
          </>
        ) : null}
        <div className="grid grid-cols-2 gap-4 px-4 py-4">
          <div>
            <Label htmlFor={idLangue} className="mb-1.5">
              {tSommaire('rangees.langue')}
            </Label>
            <Select
              value={locale}
              onValueChange={(suivante) => {
                const code = LOCALES.find((l) => l === suivante);
                if (code) langue.choisir(code);
              }}
              items={langues}
              disabled={langue.enCours}
            >
              <SelectTrigger id={idLangue} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {langues.map((o) => (
                  <SelectItem key={o.value} value={o.value} lang={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ProfileTimezoneSection timezone={timezone} immediat />
        </div>
      </div>
    </section>
  );
}
