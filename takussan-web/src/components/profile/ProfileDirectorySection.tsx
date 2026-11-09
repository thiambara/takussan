'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

interface ProfileDirectorySectionProps {
  /** `users.listed_in_public_directory`, servi pour SOI par `GET /api/auth/me` ; absent vaut « non ». */
  readonly listed?: boolean;
}

/**
 * TCK-2506 — paraître, ou non, dans l'annuaire public des propriétaires.
 *
 * Un particulier qui confie son bien n'y est plus listé d'office : c'est son choix, et seul le
 * compte lui-même le fait (`PATCH /api/me`, colonne hors `$fillable` côté API). Enregistré au
 * geste, comme les cases WhatsApp : un interrupteur qui attendrait un bouton « Enregistrer » se lit
 * comme déjà appliqué. En cas d'échec, l'interrupteur revient à l'état enregistré.
 */
export function ProfileDirectorySection({ listed = false }: ProfileDirectorySectionProps) {
  const t = useTranslations('profile.directory');
  const [inscrit, setInscrit] = useState(listed);
  const [retour, setRetour] = useState<{ ok: boolean; message: string } | null>(null);
  const [enCours, demarrer] = useTransition();

  function basculer(valeur: boolean) {
    setRetour(null);
    setInscrit(valeur);
    demarrer(async () => {
      let ok = false;
      try {
        const res = await fetch('/api/me', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listed_in_public_directory: valeur }),
        });
        ok = res.ok;
      } catch {
        ok = false;
      }
      if (!ok) {
        setInscrit(!valeur);
        setRetour({ ok: false, message: t('error') });
        return;
      }
      setRetour({ ok: true, message: valeur ? t('savedOn') : t('savedOff') });
    });
  }

  return (
    <section className="space-y-4 rounded-2xl bg-card p-6">
      <h2 className="text-lg font-bold text-foreground">{t('title')}</h2>
      <div className="relative flex items-start gap-4 rounded-lg border border-input bg-background px-4 py-3 transition-colors hover:bg-muted/40">
        <input
          id="listed_in_public_directory"
          type="checkbox"
          role="switch"
          checked={inscrit}
          disabled={enCours}
          aria-describedby="listed_in_public_directory-hint"
          onChange={(event) => basculer(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-input accent-primary"
        />
        <div>
          <label
            htmlFor="listed_in_public_directory"
            className="cursor-pointer text-sm font-medium text-foreground after:absolute after:inset-0 after:rounded-lg"
          >
            {t('label')}
          </label>
          <p id="listed_in_public_directory-hint" className="mt-0.5 text-pretty text-xs text-muted-foreground">
            {t('hint')}
          </p>
        </div>
      </div>
      {retour && (
        <p role="status" className={retour.ok ? 'text-sm text-success' : 'text-sm text-destructive'}>
          {retour.message}
        </p>
      )}
    </section>
  );
}
