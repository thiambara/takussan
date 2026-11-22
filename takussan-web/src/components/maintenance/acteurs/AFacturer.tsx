'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { jourRelatif } from '@/lib/maintenance/mes-demandes';
import { montantAFacturer, montantSaisiValide } from '@/lib/maintenance/semaine-du-prestataire';
import { useFacturer } from '@/lib/queries/maintenance-signalement';
import type { ServiceProviderBill } from '@/types/invoice';

/**
 * TCK-2919 (ADR-0120 § 1) — « À facturer · n » du prestataire (maquette `app-interventions` a, écran
 * e7, `AFacturer`) : ses factures nées en brouillon à la fin des travaux, FILTRÉES par l'API
 * (`useFacturesAFacturer`). Chaque ligne nomme l'intervention, le bien et le jour de fin (le
 * `created_at` du brouillon : il naît à la clôture des travaux), et porte « Facturer ».
 *
 * « Facturer » ouvre la saisie (feuille au téléphone, panneau au bureau) : le montant final, prérempli
 * de celui du brouillon (coût réel, à défaut devis approuvé — l'API l'a pris), son numéro de facture
 * et sa pièce, facultatifs ; puis `POST …/{id}/submit`. Les listes se relisent : la ligne quitte
 * « À facturer » et entre dans « Mes factures ». Pas de zod : `/app/maintenance` est un écran de
 * lecture (`zod-hors-des-ecrans-de-lecture.test.ts`).
 */
export function AFacturer({ factures, total }: { readonly factures: readonly ServiceProviderBill[]; readonly total: number }) {
  const t = useTranslations('maintenance.prestataire.aFacturer');
  const [ouverte, setOuverte] = useState<ServiceProviderBill | null>(null);

  if (factures.length === 0) return null;
  return (
    <section aria-labelledby="prestataire-a-facturer" className="space-y-3" data-slot="a-facturer">
      <h2 id="prestataire-a-facturer" className="font-display text-lg font-semibold tracking-titre">
        {t('titre', { n: total })}
      </h2>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {factures.map((b) => (
          <LigneAFacturer key={b.id} facture={b} onFacturer={() => setOuverte(b)} />
        ))}
      </ul>
      {ouverte ? <SaisieDeLaFacture key={ouverte.id} facture={ouverte} onFermer={() => setOuverte(null)} /> : null}
    </section>
  );
}

function LigneAFacturer({ facture, onFacturer }: { readonly facture: ServiceProviderBill; readonly onFacturer: () => void }) {
  const t = useTranslations('maintenance.prestataire.aFacturer');
  const f = useFormatteurs();
  const objet = facture.maintenance_request?.title ?? facture.reference_number ?? '';
  const fin = facture.created_at
    ? t('terminee', { jour: jourRelatif(facture.created_at, new Date(), (d) => d.toISOString().slice(0, 10)), date: f.jourMois(facture.created_at) })
    : null;
  const detail = [facture.property?.title, fin].filter(Boolean).join(' · ');

  return (
    <li className="flex items-center gap-3 px-4 py-2.5" data-slot="ligne-a-facturer">
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-corps font-medium">{objet}</span>
        {detail ? <span className="block text-ui text-muted-foreground">{detail}</span> : null}
      </span>
      <Button type="button" variant="outline" size="lg" className="flex-none" onClick={onFacturer} aria-label={t('facturerObjet', { objet })}>
        <FileText data-icon="inline-start" className="text-muted-foreground" aria-hidden="true" />
        {t('facturer')}
      </Button>
    </li>
  );
}

function SaisieDeLaFacture({ facture, onFermer }: { readonly facture: ServiceProviderBill; readonly onFermer: () => void }) {
  const t = useTranslations('maintenance.prestataire.aFacturer');
  const messageErreur = useMessageErreurApi();
  const facturer = useFacturer();
  const [montant, setMontant] = useState(() => montantAFacturer(facture));
  const [reference, setReference] = useState('');
  const [piece, setPiece] = useState<File | null>(null);
  const valide = montantSaisiValide(montant);
  const objet = facture.maintenance_request?.title ?? facture.reference_number ?? '';
  const idDuFormulaire = `facturer-${facture.id}`;

  const envoyer = () => {
    if (valide === null) return;
    facturer.mutate(
      { id: facture.id, amount: valide, provider_reference: reference.trim() || undefined, file: piece },
      { onSuccess: onFermer },
    );
  };

  return (
    <FeuilleDuBas
      open
      onOpenChange={(o) => (o ? undefined : onFermer())}
      titre={t('saisie.titre', { objet })}
      pied={
        <Button type="submit" form={idDuFormulaire} size="lg" className="w-full md:w-auto" disabled={valide === null || facturer.isPending}>
          {facturer.isPending ? t('saisie.envoi') : t('saisie.envoyer')}
        </Button>
      }
    >
      <form
        id={idDuFormulaire}
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          envoyer();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor={`${idDuFormulaire}-montant`}>{t('saisie.montant', { devise: facture.currency })}</Label>
          <Input
            id={`${idDuFormulaire}-montant`}
            profil="montant"
            placeholder={t('saisie.montantExemple')}
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            aria-invalid={montant !== '' && valide === null}
            aria-describedby={`${idDuFormulaire}-montant-aide`}
          />
          <p id={`${idDuFormulaire}-montant-aide`} className="text-xs text-muted-foreground">
            {t('saisie.montantAide')}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idDuFormulaire}-reference`}>{t('saisie.reference')}</Label>
          <Input profil="mots" id={`${idDuFormulaire}-reference`} placeholder={t('saisie.referenceExemple')} value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idDuFormulaire}-piece`}>{t('saisie.piece')}</Label>
          <Input
            id={`${idDuFormulaire}-piece`}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => setPiece(e.target.files?.[0] ?? null)}
          />
        </div>
        {facturer.error ? (
          <p role="alert" className="text-sm text-destructive">
            {messageErreur(facturer.error, t('saisie.echec'))}
          </p>
        ) : null}
      </form>
    </FeuilleDuBas>
  );
}
