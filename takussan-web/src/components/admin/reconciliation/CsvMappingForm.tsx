'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useSaveCsvMapping } from '@/lib/queries/reconciliation';
import type {
  CsvMapping,
  DecimalSeparator,
  SignConvention,
  ThousandsSeparator,
} from '@/types/reconciliation';

/**
 * TCK-593 (Partie 4) — le paramétrage CSV de l'agence : quelle colonne porte quoi, et comment lire
 * un montant.
 *
 * ⚠ Le séparateur décimal est CHOISI, jamais deviné : « 1.500 » vaut mille cinq cents dans un
 * relevé sénégalais et un et demi dans un relevé anglo-saxon. Une erreur ici ne fait pas échouer
 * l'import, elle lit des montants faux — d'où un choix explicite, sans valeur cochée d'office quand
 * l'API n'en a pas, et un enregistrement refusé tant qu'il manque.
 */
const DELIMITEURS = [',', ';', '\t', '|'] as const;
const MILLIERS: readonly ThousandsSeparator[] = [null, ' ', '.', ',', "'"];

const CLASSE_SELECT =
  'h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm text-foreground';

/** Une colonne se désigne par son nom (avec en-tête) ou son rang (sans) : `"3"` devient `3`. */
function colonne(valeur: string): string | number | null {
  const v = valeur.trim();
  if (v === '') return null;
  return /^\d+$/.test(v) ? Number(v) : v;
}

const texte = (v: string | number | null) => (v === null ? '' : String(v));

const COLONNES = [
  'date_column',
  'amount_column',
  'label_column',
  'reference_column',
  'counterparty_column',
  'currency_column',
] as const;

type ColonneCle = (typeof COLONNES)[number];

interface CsvMappingFormProps {
  readonly agencyId: number;
  readonly initial: CsvMapping;
}

export function CsvMappingForm({ agencyId, initial }: CsvMappingFormProps) {
  const t = useTranslations('admin.reconciliation.mapping');
  const messageErreur = useMessageErreurApi();
  const enregistrer = useSaveCsvMapping(agencyId);

  const [delimiter, setDelimiter] = useState(initial.delimiter ?? ',');
  const [hasHeader, setHasHeader] = useState(initial.has_header ?? true);
  const [colonnes, setColonnes] = useState<Record<ColonneCle, string>>(() => ({
    date_column: texte(initial.date_column),
    amount_column: texte(initial.amount_column),
    label_column: texte(initial.label_column),
    reference_column: texte(initial.reference_column),
    counterparty_column: texte(initial.counterparty_column),
    currency_column: texte(initial.currency_column),
  }));
  const [dateFormat, setDateFormat] = useState(initial.date_format ?? '');
  const [signConvention, setSignConvention] = useState<SignConvention>(
    initial.sign_convention ?? 'amount_signed',
  );
  const [directionColumn, setDirectionColumn] = useState(texte(initial.direction_column));
  const [decimal, setDecimal] = useState<DecimalSeparator | null>(initial.decimal_separator ?? null);
  const [milliers, setMilliers] = useState<ThousandsSeparator>(initial.thousands_separator ?? null);
  const [message, setMessage] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(null);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!decimal) {
      setMessage({ ton: 'erreur', texte: t('decimalRequired') });
      return;
    }
    const mapping: CsvMapping = {
      delimiter,
      has_header: hasHeader,
      date_column: colonne(colonnes.date_column),
      date_format: dateFormat.trim() === '' ? null : dateFormat.trim(),
      amount_column: colonne(colonnes.amount_column),
      label_column: colonne(colonnes.label_column),
      reference_column: colonne(colonnes.reference_column),
      counterparty_column: colonne(colonnes.counterparty_column),
      currency_column: colonne(colonnes.currency_column),
      sign_convention: signConvention,
      direction_column: signConvention === 'direction_column' ? colonne(directionColumn) : null,
      decimal_separator: decimal,
      thousands_separator: milliers,
    };
    try {
      await enregistrer.mutateAsync(mapping);
      setMessage({ ton: 'ok', texte: t('saved') });
    } catch (err) {
      setMessage({ ton: 'erreur', texte: messageErreur(err, t('saveFailed')) });
    }
  }

  return (
    <form onSubmit={soumettre} className="space-y-4" aria-label={t('title')}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="csv-delimiter">{t('delimiter')}</Label>
          <select
            id="csv-delimiter"
            className={CLASSE_SELECT}
            value={delimiter}
            onChange={(e) => setDelimiter(e.target.value)}
          >
            {DELIMITEURS.map((d) => (
              <option key={d} value={d}>
                {t(`delimiters.${d === '\t' ? 'tab' : d === ',' ? 'comma' : d === ';' ? 'semicolon' : 'pipe'}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2 pb-2">
          <input
            id="csv-has-header"
            type="checkbox"
            checked={hasHeader}
            onChange={(e) => setHasHeader(e.target.checked)}
            className="size-4 accent-primary"
          />
          <Label htmlFor="csv-has-header">{t('hasHeader')}</Label>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="csv-date-format">{t('dateFormat')}</Label>
          <Input
            id="csv-date-format"
            value={dateFormat}
            onChange={(e) => setDateFormat(e.target.value)}
            placeholder={t('dateFormatPlaceholder')}
          />
        </div>
        {COLONNES.map((cle) => (
          <div key={cle} className="space-y-1.5">
            <Label htmlFor={`csv-${cle}`}>{t(`columns.${cle}`)}</Label>
            <Input
              id={`csv-${cle}`}
              value={colonnes[cle]}
              onChange={(e) => setColonnes((c) => ({ ...c, [cle]: e.target.value }))}
            />
          </div>
        ))}
        <div className="space-y-1.5">
          <Label htmlFor="csv-sign">{t('signConvention')}</Label>
          <select
            id="csv-sign"
            className={CLASSE_SELECT}
            value={signConvention}
            onChange={(e) => setSignConvention(e.target.value as SignConvention)}
          >
            <option value="amount_signed">{t('signConventions.amount_signed')}</option>
            <option value="direction_column">{t('signConventions.direction_column')}</option>
          </select>
        </div>
        {signConvention === 'direction_column' && (
          <div className="space-y-1.5">
            <Label htmlFor="csv-direction-column">{t('columns.direction_column')}</Label>
            <Input
              id="csv-direction-column"
              value={directionColumn}
              onChange={(e) => setDirectionColumn(e.target.value)}
            />
          </div>
        )}
      </div>

      <fieldset className="space-y-2 rounded-lg border border-border p-3">
        <legend className="px-1 text-sm font-medium text-foreground">{t('decimalSeparator')}</legend>
        <p className="text-xs text-muted-foreground">{t('decimalHint')}</p>
        <div className="flex flex-wrap gap-4">
          {(['.', ','] as const).map((sep) => (
            <label key={sep} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                name="csv-decimal"
                value={sep}
                checked={decimal === sep}
                onChange={() => setDecimal(sep)}
                className="size-4 accent-primary"
              />
              {t(sep === '.' ? 'decimals.dot' : 'decimals.comma')}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="max-w-xs space-y-1.5">
        <Label htmlFor="csv-thousands">{t('thousandsSeparator')}</Label>
        <select
          id="csv-thousands"
          className={CLASSE_SELECT}
          value={milliers === null ? '' : milliers}
          onChange={(e) =>
            setMilliers(e.target.value === '' ? null : (e.target.value as ThousandsSeparator))
          }
        >
          {MILLIERS.map((m) => (
            <option key={m ?? 'none'} value={m ?? ''}>
              {t(
                `thousands.${m === null ? 'none' : m === ' ' ? 'space' : m === '.' ? 'dot' : m === ',' ? 'comma' : 'apostrophe'}`,
              )}
            </option>
          ))}
        </select>
      </div>

      {message && (
        <p
          role={message.ton === 'erreur' ? 'alert' : 'status'}
          className={message.ton === 'erreur' ? 'text-sm text-destructive' : 'text-sm text-foreground'}
        >
          {message.texte}
        </p>
      )}

      <Button type="submit" disabled={enregistrer.isPending}>
        {enregistrer.isPending ? t('saving') : t('save')}
      </Button>
    </form>
  );
}
