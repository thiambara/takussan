'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { UserPlus } from 'lucide-react';

import { createCustomerAction, type CustomerDuplicateMatch } from '@/app/actions/dashboard-customers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import type { CustomerListItem } from '@/types/customer';

/** Ce que la création rapide rend au formulaire du bail : assez pour le nommer et juger la signature. */
export type LocataireRetenu = Pick<CustomerListItem, 'id' | 'first_name' | 'last_name' | 'phone' | 'email'> & {
  readonly full_name?: string;
  /** Le compte du locataire : `null` sans compte (la signature en ligne lui est fermée). */
  readonly user_id?: number | null;
};

/**
 * TCK-2643 (étape « Locataire ») — créer le locataire SANS quitter le bail : prénom, nom et
 * téléphone, par l'action de création de client existante (`POST /api/customers`).
 *
 * Décision 8 de la session : au personnel seul (l'appelant ne monte ce bloc que pour lui) ; prénom
 * ET nom, l'API les exige. Une fiche au même téléphone (409 `customer.duplicate`) est PROPOSÉE —
 * « Choisir » la retient pour le bail — avant « Créer quand même ».
 *
 * Écrit dans le `<form>` du bail : ses champs ne portent pas de `name` et ses boutons sont
 * `type="button"` — rien n'en part avec le bail, et rien ne l'envoie.
 */
export function CreationRapideDuLocataire({
  onCree,
  onChoisi,
}: {
  readonly onCree: (locataire: LocataireRetenu) => void;
  /** Une fiche existante proposée au doublon : son identifiant et son nom. */
  readonly onChoisi: (id: number, nom: string | null) => void;
}) {
  const t = useTranslations('lease.form.creationRapide');
  const tDoublon = useTranslations('lease.form.creationRapide.doublon');
  const id = useId();
  const [ouvert, setOuvert] = useState(false);
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [erreurs, setErreurs] = useState<{ prenom?: string; nom?: string; global?: string }>({});
  const [doublons, setDoublons] = useState<CustomerDuplicateMatch[] | null>(null);
  const [enCours, setEnCours] = useState(false);

  if (!ouvert) {
    return (
      <Button type="button" variant="outline" className="gap-2" onClick={() => setOuvert(true)}>
        <UserPlus className="size-4" aria-hidden="true" />
        {t('ouvrir')}
      </Button>
    );
  }

  const creer = async (malgreLeDoublon: boolean) => {
    const manque = {
      prenom: prenom.trim() === '' ? t('prenomRequis') : undefined,
      nom: nom.trim() === '' ? t('nomRequis') : undefined,
    };
    setErreurs(manque);
    if (manque.prenom || manque.nom) return;

    setEnCours(true);
    const resultat = await createCustomerAction({
      first_name: prenom.trim(),
      last_name: nom.trim(),
      phone: telephone || null,
      ...(malgreLeDoublon ? { allow_duplicate: true } : {}),
    });
    setEnCours(false);

    if (resultat.ok && resultat.data) {
      const c = resultat.data;
      onCree({ id: c.id, first_name: c.first_name, last_name: c.last_name, full_name: c.full_name, phone: c.phone, email: c.email, user_id: c.user_id ?? null });
      setOuvert(false);
      return;
    }
    if (!resultat.ok && resultat.duplicates) {
      setDoublons(resultat.duplicates);
      return;
    }
    setErreurs({ global: resultat.ok ? t('echec') : resultat.message });
  };

  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-semibold">{t('titre')}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-prenom`} className="mb-1.5 block text-sm font-medium">
            {t('prenom')}
          </label>
          <Input
            id={`${id}-prenom`}
            value={prenom}
            onChange={(e) => setPrenom(e.target.value)}
            autoComplete="off"
            aria-invalid={erreurs.prenom ? true : undefined}
            aria-describedby={erreurs.prenom ? `${id}-prenom-erreur` : undefined}
          />
          {erreurs.prenom ? (
            <p id={`${id}-prenom-erreur`} role="alert" className="mt-1 text-xs text-destructive">
              {erreurs.prenom}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor={`${id}-nom`} className="mb-1.5 block text-sm font-medium">
            {t('nom')}
          </label>
          <Input
            id={`${id}-nom`}
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            autoComplete="off"
            aria-invalid={erreurs.nom ? true : undefined}
            aria-describedby={erreurs.nom ? `${id}-nom-erreur` : undefined}
          />
          {erreurs.nom ? (
            <p id={`${id}-nom-erreur`} role="alert" className="mt-1 text-xs text-destructive">
              {erreurs.nom}
            </p>
          ) : null}
        </div>
      </div>
      <div>
        <label htmlFor={`${id}-telephone`} className="mb-1.5 block text-sm font-medium">
          {t('telephone')}
        </label>
        <PhoneInput id={`${id}-telephone`} value={telephone} onValueChange={setTelephone} autoComplete="off" />
      </div>

      {doublons ? (
        <div role="status" className="space-y-2 rounded-lg border border-border bg-muted/50 p-3 text-sm">
          <p className="font-medium text-foreground">{tDoublon('titre')}</p>
          <ul className="space-y-1.5">
            {doublons.map((d, i) => (
              <li key={d.id ?? `masquee-${i}`} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {d.name ?? tDoublon('masquee')}
                  {' · '}
                  {d.matched_on === 'phone' ? tDoublon('memeTelephone') : tDoublon('memeEmail')}
                </span>
                {d.id !== null ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => onChoisi(d.id as number, d.name)}>
                    {t('choisir')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {erreurs.global ? (
        <p role="alert" className="text-sm text-destructive">
          {erreurs.global}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setOuvert(false)} disabled={enCours}>
          {t('annuler')}
        </Button>
        <Button type="button" onClick={() => void creer(doublons !== null)} disabled={enCours}>
          {doublons ? tDoublon('creerQuandMeme') : t('creer')}
        </Button>
      </div>
    </fieldset>
  );
}
