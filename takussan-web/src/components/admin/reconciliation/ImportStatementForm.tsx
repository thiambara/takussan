'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { FileUp, TriangleAlert, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useApercuDuReleve, useImportBankStatement } from '@/lib/queries/reconciliation';
import { cn } from '@/lib/utils';
import type { ApercuDuReleve, BankStatementSourceFormat } from '@/types/reconciliation';

import { enNombre } from './format';

/**
 * TCK-593 (Partie 4) — import d'un relevé CSV ou OFX. L'API répond 202 : l'analyse tourne en file,
 * le relevé apparaît dans la liste en « analyse en cours ».
 *
 * TCK-2933 — **l'import passe toujours par l'aperçu** : le fichier choisi est d'abord LU
 * (`POST …/bank-statements/preview`, TCK-2932 — rien n'est écrit), l'écran montre les lignes lues,
 * celles qui ne le sont pas et pourquoi, la période et les dix premières lignes ; puis « Importer »
 * envoie le même fichier, ou « Changer de fichier » repart sans rien créer. Changer le format relit.
 */
function formatDeduit(nom: string): BankStatementSourceFormat {
  return nom.toLowerCase().endsWith('.ofx') ? 'ofx' : 'csv';
}

export function ImportStatementForm({ agencyId }: { readonly agencyId: number }) {
  const t = useTranslations('admin.reconciliation.import');
  const messageErreur = useMessageErreurApi();
  const importer = useImportBankStatement(agencyId);
  const lire = useApercuDuReleve(agencyId);
  const fichierRef = useRef<HTMLInputElement>(null);
  const [fichier, setFichier] = useState<File | null>(null);
  const [format, setFormat] = useState<BankStatementSourceFormat>('csv');
  const [banque, setBanque] = useState('');
  const [message, setMessage] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(null);
  const [apercu, setApercu] = useState<ApercuDuReleve | null>(null);
  const [erreurApercu, setErreurApercu] = useState<string | null>(null);
  // La lecture en cours : seule la plus récente (dernier fichier, dernier format) a le droit d'écrire.
  const lectureCourante = useRef(0);

  async function lireLeFichier(f: File, fmt: BankStatementSourceFormat) {
    const n = ++lectureCourante.current;
    setApercu(null);
    setErreurApercu(null);
    const corps = new FormData();
    corps.append('file', f);
    corps.append('source_format', fmt);
    try {
      const r = await lire.mutateAsync(corps);
      if (n === lectureCourante.current) setApercu(r.data);
    } catch (err) {
      if (n === lectureCourante.current) setErreurApercu(messageErreur(err, t('apercu.echec')));
    }
  }

  function oublierLeFichier() {
    lectureCourante.current++;
    setFichier(null);
    setApercu(null);
    setErreurApercu(null);
    if (fichierRef.current) fichierRef.current.value = '';
  }

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    // L'import n'est offert qu'après un aperçu lu, et refusé d'avance pour un fichier déjà importé.
    if (!fichier || !apercu || apercu.already_imported) return;
    setMessage(null);
    const corps = new FormData();
    corps.append('file', fichier);
    corps.append('source_format', format);
    if (banque.trim() !== '') corps.append('bank_name', banque.trim());
    try {
      await importer.mutateAsync(corps);
      setMessage({ ton: 'ok', texte: t('accepted') });
      oublierLeFichier();
      setBanque('');
    } catch (err) {
      setMessage({ ton: 'erreur', texte: messageErreur(err, t('failed')) });
    }
  }

  const optionsFormat = [
    { value: 'csv', label: t('formats.csv') },
    { value: 'ofx', label: t('formats.ofx') },
  ];

  return (
    <form onSubmit={soumettre} className="space-y-3" aria-label={t('title')}>
      <div className="grid gap-4">
        <div className="space-y-1.5">
          {/* TCK-2675 — un vrai bouton traduit : le contrôle natif disait « Choose File » et « No file
              chosen » dans la langue du navigateur, pas dans celle de la page. Le champ reste dans le
              formulaire (masqué), le bouton l'ouvre ; le libellé nomme le fichier choisi. */}
          <Label htmlFor="releve-fichier">{t('file')}</Label>
          <input
            id="releve-fichier"
            ref={fichierRef}
            type="file"
            accept=".csv,.ofx,.txt,text/csv"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFichier(f);
              setMessage(null);
              if (f) {
                const fmt = formatDeduit(f.name);
                setFormat(fmt);
                void lireLeFichier(f, fmt);
              } else {
                setApercu(null);
                setErreurApercu(null);
              }
            }}
          />
          <div className="flex min-w-0 items-center gap-2">
            <Button type="button" variant="outline" className="flex-none" onClick={() => fichierRef.current?.click()}>
              <FileUp data-icon="inline-start" aria-hidden="true" />
              {t('choisir')}
            </Button>
            <span className="min-w-0 truncate text-sm text-muted-foreground" data-testid="releve-fichier-nom">
              {fichier ? fichier.name : t('aucunFichier')}
            </span>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="releve-format">{t('format')}</Label>
          <Select
            value={format}
            onValueChange={(next) => {
              if (next === null) return;
              const fmt = next as BankStatementSourceFormat;
              setFormat(fmt);
              // L'aperçu dit ce que CE format lit : un autre format relit le fichier.
              if (fichier && fmt !== format) void lireLeFichier(fichier, fmt);
            }}
            items={optionsFormat}
          >
            <SelectTrigger id="releve-format" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {optionsFormat.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="releve-banque">{t('bankName')}</Label>
          <Input
            id="releve-banque"
            profil="mots"
            placeholder={t('bankNamePlaceholder')}
            value={banque}
            onChange={(e) => setBanque(e.target.value)}
          />
        </div>
      </div>
      {fichier ? (
        lire.isPending && !apercu ? (
          <div aria-busy="true" className="space-y-2">
            <p className="text-sm text-muted-foreground" role="status">
              {t('apercu.lecture')}
            </p>
            <Skeleton className="h-24 rounded-lg" />
          </div>
        ) : erreurApercu ? (
          <p role="alert" className="text-sm text-destructive">
            {erreurApercu}
          </p>
        ) : apercu ? (
          <ApercuLu apercu={apercu} />
        ) : null
      ) : null}
      {message && (
        <p
          role={message.ton === 'erreur' ? 'alert' : 'status'}
          className={message.ton === 'erreur' ? 'text-sm text-destructive' : 'text-sm text-foreground'}
        >
          {message.texte}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!fichier || !apercu || apercu.already_imported || apercu.read === 0 || importer.isPending}>
          <Upload data-icon="inline-start" aria-hidden="true" />
          {importer.isPending ? t('uploading') : t('submit')}
        </Button>
        {fichier ? (
          <Button
            type="button"
            variant="outline"
            disabled={importer.isPending}
            onClick={() => {
              oublierLeFichier();
              fichierRef.current?.click();
            }}
          >
            {t('apercu.changer')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/** Le nombre de lignes non lues nommées une à une ; au-delà, « et N autres lignes ». */
const LIGNES_NON_LUES_NOMMEES = 5;

/** Ce que l'aperçu a lu : comptes, raisons, période, premières lignes — sans rien écrire. */
function ApercuLu({ apercu }: { readonly apercu: ApercuDuReleve }) {
  const t = useTranslations('admin.reconciliation.import.apercu');
  const f = useFormatteurs();
  const raison = (code: string) => (t.has(`raisons.${code}`) ? t(`raisons.${code}`) : t('raisons.inconnue'));
  const jour = (d: string) => f.jourMois(`${d}T12:00:00Z`);
  const nommees = apercu.skipped_lines.slice(0, LIGNES_NON_LUES_NOMMEES);
  const autres = apercu.skipped - nommees.length;
  const { start, end } = apercu.period;

  return (
    <section aria-labelledby="apercu-titre" className="space-y-3 rounded-lg border border-border bg-muted/30 p-3" data-testid="apercu-du-releve">
      <h3 id="apercu-titre" className="text-sm font-semibold">
        {t('titre')}
      </h3>
      <p className="text-sm" data-testid="apercu-comptes">
        <span className="font-medium">{t('lues', { count: apercu.read })}</span>
        <span className="text-muted-foreground"> · {t('nonLues', { count: apercu.skipped })}</span>
        {start && end ? <span className="text-muted-foreground"> · {t('periode', { debut: jour(start), fin: jour(end) })}</span> : null}
      </p>
      {apercu.already_imported ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-warning">
          <TriangleAlert className="mt-0.5 size-4 flex-none" strokeWidth={1.75} aria-hidden="true" />
          {t('dejaImporte')}
        </p>
      ) : null}
      {apercu.read === 0 && !apercu.already_imported ? <p className="text-sm text-warning">{t('aucuneLigne')}</p> : null}
      {nommees.length > 0 ? (
        <ul className="space-y-0.5 text-ui text-muted-foreground" data-testid="apercu-non-lues">
          {nommees.map((l) => (
            <li key={l.line}>{t('ligneNonLue', { line: l.line, raison: raison(l.reason) })}</li>
          ))}
          {autres > 0 ? <li>{t('etAutres', { count: autres })}</li> : null}
        </ul>
      ) : null}
      {apercu.lines.length > 0 ? (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">{t('premieres', { count: apercu.lines.length })}</p>
          <ul className="divide-y divide-border rounded-md border border-border bg-card text-ui" data-testid="apercu-lignes">
            {apercu.lines.map((l, i) => {
              const montant = f.montantCourt(Math.abs(enNombre(l.amount) ?? 0), l.currency ?? 'XOF');
              return (
                <li key={`${i}-${l.date}`} className="flex items-center gap-3 px-3 py-1.5">
                  <span className="w-16 flex-none text-muted-foreground tabular-nums">{jour(l.date)}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-encre-douce">{l.label ?? l.reference ?? l.counterparty ?? ''}</span>
                  <span className={cn('flex-none font-medium tabular-nums', l.direction === 'credit' ? 'text-success' : 'text-foreground')}>
                    {l.direction === 'credit' ? '+' : '−'}
                    {'\u00a0'}
                    {montant}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
