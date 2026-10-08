'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useImportBankStatement } from '@/lib/queries/reconciliation';
import type { BankStatementSourceFormat } from '@/types/reconciliation';

/**
 * TCK-593 (Partie 4) — import d'un relevé CSV ou OFX. L'API répond 202 : l'analyse tourne en file,
 * le relevé apparaît dans la liste en « analyse en cours ».
 */
function formatDeduit(nom: string): BankStatementSourceFormat {
  return nom.toLowerCase().endsWith('.ofx') ? 'ofx' : 'csv';
}

const CLASSE_SELECT =
  'h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm text-foreground';

export function ImportStatementForm({ agencyId }: { readonly agencyId: number }) {
  const t = useTranslations('admin.reconciliation.import');
  const messageErreur = useMessageErreurApi();
  const importer = useImportBankStatement(agencyId);
  const fichierRef = useRef<HTMLInputElement>(null);
  const [fichier, setFichier] = useState<File | null>(null);
  const [format, setFormat] = useState<BankStatementSourceFormat>('csv');
  const [banque, setBanque] = useState('');
  const [message, setMessage] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(null);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    if (!fichier) return;
    setMessage(null);
    const corps = new FormData();
    corps.append('file', fichier);
    corps.append('source_format', format);
    if (banque.trim() !== '') corps.append('bank_name', banque.trim());
    try {
      await importer.mutateAsync(corps);
      setMessage({ ton: 'ok', texte: t('accepted') });
      setFichier(null);
      setBanque('');
      if (fichierRef.current) fichierRef.current.value = '';
    } catch (err) {
      setMessage({ ton: 'erreur', texte: messageErreur(err, t('failed')) });
    }
  }

  return (
    <form onSubmit={soumettre} className="space-y-3" aria-label={t('title')}>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_2fr]">
        <div className="space-y-1.5">
          <Label htmlFor="releve-fichier">{t('file')}</Label>
          <Input
            id="releve-fichier"
            ref={fichierRef}
            type="file"
            accept=".csv,.ofx,.txt,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFichier(f);
              if (f) setFormat(formatDeduit(f.name));
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="releve-format">{t('format')}</Label>
          <select
            id="releve-format"
            className={CLASSE_SELECT}
            value={format}
            onChange={(e) => setFormat(e.target.value as BankStatementSourceFormat)}
          >
            <option value="csv">{t('formats.csv')}</option>
            <option value="ofx">{t('formats.ofx')}</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="releve-banque">{t('bankName')}</Label>
          <Input id="releve-banque" value={banque} onChange={(e) => setBanque(e.target.value)} />
        </div>
      </div>
      {message && (
        <p
          role={message.ton === 'erreur' ? 'alert' : 'status'}
          className={message.ton === 'erreur' ? 'text-sm text-destructive' : 'text-sm text-foreground'}
        >
          {message.texte}
        </p>
      )}
      <Button type="submit" disabled={!fichier || importer.isPending}>
        <Upload data-icon="inline-start" aria-hidden="true" />
        {importer.isPending ? t('uploading') : t('submit')}
      </Button>
    </form>
  );
}
