'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ProfileTimezoneSectionProps {
  /** Le fuseau du compte (`users.timezone`), `null` ou absent : Dakar, le défaut de la colonne. */
  readonly timezone?: string | null;
}

const FUSEAU_PAR_DEFAUT = 'Africa/Dakar';

/** Les fuseaux IANA que connaît le moteur, le fuseau du compte compris s'il n'y est pas. */
function fuseaux(courant: string): string[] {
  const liste = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return liste.includes(courant) ? liste : [courant, ...liste];
}

/**
 * TCK-1497 (P107.03, porteur 2026-10-22) — un fuseau par compte. Les notifications, les rappels
 * de visite et l'heure d'envoi du résumé se rendent dans `users.timezone` ; il n'avait aucun
 * écrivain. Il s'enregistre par le relais `PATCH /api/me` (`timezone`, `timezone:all` côté API).
 * Les dates des écrans du front restent à Dakar : ce réglage ne gouverne que les rendus de l'API.
 */
export function ProfileTimezoneSection({ timezone }: ProfileTimezoneSectionProps) {
  const t = useTranslations('profile.timezone');
  const tCommon = useTranslations('common.actions');
  const [enregistre, setEnregistre] = useState(timezone || FUSEAU_PAR_DEFAUT);
  const [choix, setChoix] = useState(enregistre);
  const [retour, setRetour] = useState<{ ok: boolean; message: string } | null>(null);
  const [enCours, demarrer] = useTransition();

  function enregistrer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRetour(null);
    demarrer(async () => {
      let ok = false;
      try {
        const res = await fetch('/api/me', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timezone: choix }),
        });
        ok = res.ok;
      } catch {
        ok = false;
      }
      if (!ok) {
        setRetour({ ok: false, message: t('error') });
        return;
      }
      setEnregistre(choix);
      setRetour({ ok: true, message: t('saved') });
    });
  }

  const optionsFuseau = fuseaux(choix).map((fuseau) => ({ value: fuseau, label: fuseau }));

  return (
    <section className="space-y-4 rounded-2xl bg-card p-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <form onSubmit={enregistrer} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="profile-timezone">{t('label')}</Label>
          <Select
            value={choix}
            onValueChange={(next) => {
              if (next !== null) setChoix(next);
            }}
            items={optionsFuseau}
          >
            <SelectTrigger id="profile-timezone" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {optionsFuseau.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {retour && (
          <p role="status" className={retour.ok ? 'text-sm text-success' : 'text-sm text-destructive'}>
            {retour.message}
          </p>
        )}
        <Button type="submit" disabled={enCours || choix === enregistre}>
          {tCommon('save')}
        </Button>
      </form>
    </section>
  );
}
