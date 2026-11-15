'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

/** Une valeur vide n'est pas une option du Select : « aucun séparateur de milliers » porte ce repère. */
const AUCUN = '__none__';

/** Une colonne se désigne par son nom (avec en-tête) ou son rang (sans) : `"3"` devient `3`. */
function colonne(valeur: string): string | number | null {
  const v = valeur.trim();
  if (v === '') return null;
  return /^\d+$/.test(v) ? Number(v) : v;
}

const texte = (v: string | number | null) => (v === null ? '' : String(v));

/**
 * TCK-2675 — les noms de colonnes que l'API prend PAR DÉFAUT (`CsvDriver::DEFAULT_MAPPING`) quand
 * l'agence n'a rien réglé : des en-têtes anglais qu'aucun relevé de banque sénégalaise ne porte.
 * Les montrer (`date`, `amount`, `label`) faisait croire à un réglage fait, et en anglais : le
 * champ s'affiche vide, à indiquer. Un champ obligatoire vide refuse l'enregistrement.
 */
const NOMS_PAR_DEFAUT: Partial<Record<ColonneCle | 'direction_column', string>> = {
  date_column: 'date',
  amount_column: 'amount',
  label_column: 'label',
  reference_column: 'reference',
  counterparty_column: 'counterparty',
};
const OPTION_DE_SIGNE: Record<SignConvention, string> = { amount_signed: 'signe', direction_column: 'colonne-de-sens' };
const OBLIGATOIRES: readonly ColonneCle[] = ['date_column', 'amount_column'];

/** L'identifiant d'un champ de colonne, en français : la clé d'API (`amount_column`) n'a rien à faire dans le DOM. */
const ID_DE_COLONNE: Record<ColonneCle | 'direction_column', string> = {
  date_column: 'csv-colonne-date',
  amount_column: 'csv-colonne-montant',
  label_column: 'csv-colonne-libelle',
  reference_column: 'csv-colonne-reference',
  counterparty_column: 'csv-colonne-tiers',
  currency_column: 'csv-colonne-devise',
  direction_column: 'csv-colonne-sens',
};

function initialeDe(cle: ColonneCle, valeur: string | number | null): string {
  const v = texte(valeur);
  return NOMS_PAR_DEFAUT[cle] !== undefined && v === NOMS_PAR_DEFAUT[cle] ? '' : v;
}

/**
 * TCK-2675 — le format de date se CHOISIT sur un exemple (« 25/11/2026 ») : `d/m/Y` est la syntaxe
 * de PHP, pas une réponse qu'on puisse demander. Les options portent une clé neutre ; le format
 * n'est écrit qu'à l'envoi. Le 25 novembre, et non le 10 : un jour au-delà de 12 départage
 * « jour/mois » de « mois/jour ».
 */
const FORMATS_DE_DATE = [
  { cle: 'jma-barre', php: 'd/m/Y' },
  { cle: 'jma-court', php: 'd/m/y' },
  { cle: 'jma-tiret', php: 'd-m-Y' },
  { cle: 'jma-point', php: 'd.m.Y' },
  { cle: 'amj-tiret', php: 'Y-m-d' },
  { cle: 'amj-barre', php: 'Y/m/d' },
  { cle: 'mja-barre', php: 'm/d/Y' },
] as const;
const FORMAT_AUTRE = 'autre';
const JETONS_DE_DATE: Record<string, string> = { d: '25', j: '25', m: '11', n: '11', Y: '2026', y: '26', H: '09', G: '9', i: '30', s: '00' };

/** « d/m/Y » → « 25/11/2026 » : la forme qu'a le 25 novembre 2026 sous ce format. */
export function exempleDeFormat(php: string): string {
  let sortie = '';
  for (let i = 0; i < php.length; i++) {
    const c = php[i] ?? '';
    if (c === '\\') {
      sortie += php[i + 1] ?? '';
      i++;
    } else {
      sortie += JETONS_DE_DATE[c] ?? c;
    }
  }
  return sortie;
}

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
    date_column: initialeDe('date_column', initial.date_column),
    amount_column: initialeDe('amount_column', initial.amount_column),
    label_column: initialeDe('label_column', initial.label_column),
    reference_column: initialeDe('reference_column', initial.reference_column),
    counterparty_column: initialeDe('counterparty_column', initial.counterparty_column),
    currency_column: initialeDe('currency_column', initial.currency_column),
  }));
  const [manquantes, setManquantes] = useState<readonly ColonneCle[]>([]);
  // Le format enregistré hors de la liste reste choisissable tel quel (« Autre forme : … »).
  const formatEnregistre = initial.date_format?.trim() || 'd/m/Y';
  const formatConnu = FORMATS_DE_DATE.find((x) => x.php === formatEnregistre);
  const [formatDeDate, setFormatDeDate] = useState<string>(formatConnu?.cle ?? FORMAT_AUTRE);
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
    const vides = OBLIGATOIRES.filter((cle) => colonnes[cle].trim() === '');
    setManquantes(vides);
    if (vides.length > 0) {
      document.getElementById(ID_DE_COLONNE[vides[0]!])?.focus();
      return;
    }
    if (!decimal) {
      setMessage({ ton: 'erreur', texte: t('decimalRequired') });
      return;
    }
    const mapping: CsvMapping = {
      delimiter,
      has_header: hasHeader,
      date_column: colonne(colonnes.date_column),
      date_format: FORMATS_DE_DATE.find((x) => x.cle === formatDeDate)?.php ?? formatEnregistre,
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

  const optionsDelimiteur = DELIMITEURS.map((d) => ({
    value: d,
    label: t(`delimiters.${d === '\t' ? 'tab' : d === ',' ? 'comma' : d === ';' ? 'semicolon' : 'pipe'}`),
  }));
  const optionsFormat = [
    ...FORMATS_DE_DATE.map((x) => ({ value: x.cle, label: exempleDeFormat(x.php) })),
    ...(formatConnu ? [] : [{ value: FORMAT_AUTRE, label: t('formatAutre', { exemple: exempleDeFormat(formatEnregistre) }) }]),
  ];
  // TCK-2675 — des valeurs d'option neutres : la valeur d'API (`amount_signed`) n'entre pas dans le DOM.
  const optionsSigne = [
    { value: OPTION_DE_SIGNE.amount_signed, label: t('signConventions.amount_signed') },
    { value: OPTION_DE_SIGNE.direction_column, label: t('signConventions.direction_column') },
  ];
  const optionsMilliers = MILLIERS.map((m) => ({
    value: m ?? AUCUN,
    label: t(
      `thousands.${m === null ? 'none' : m === ' ' ? 'space' : m === '.' ? 'dot' : m === ',' ? 'comma' : 'apostrophe'}`,
    ),
  }));

  const champColonne = (cle: ColonneCle | 'direction_column', valeur: string, onChange: (v: string) => void) => {
    const manquante = cle !== 'direction_column' && manquantes.includes(cle);
    return (
      <div key={cle} className="space-y-1.5">
        <Label htmlFor={ID_DE_COLONNE[cle]}>{t(`colonnes.${cle}`)}</Label>
        <Input
          id={ID_DE_COLONNE[cle]}
          value={valeur}
          placeholder={t('exemple', { exemple: t(`exemples.${cle}`) })}
          aria-invalid={manquante || undefined}
          aria-describedby={manquante ? `${ID_DE_COLONNE[cle]}-erreur` : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        {manquante ? (
          <p id={`${ID_DE_COLONNE[cle]}-erreur`} className="text-ui text-destructive">
            {t('colonneRequise')}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <form onSubmit={soumettre} className="space-y-5" aria-label={t('title')} noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="csv-delimiter">{t('delimiter')}</Label>
          <Select
            value={delimiter}
            onValueChange={(next) => {
              if (next !== null) setDelimiter(next);
            }}
            items={optionsDelimiteur}
          >
            <SelectTrigger id="csv-delimiter" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {optionsDelimiteur.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="csv-date-format">{t('dateFormat')}</Label>
          <Select
            value={formatDeDate}
            onValueChange={(next) => {
              if (next !== null) setFormatDeDate(next);
            }}
            items={optionsFormat}
          >
            <SelectTrigger id="csv-date-format" className="w-full" aria-describedby="csv-date-format-aide">
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
          <p id="csv-date-format-aide" className="text-ui text-muted-foreground">
            {t('formatDeDateAide')}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <input
            id="csv-has-header"
            type="checkbox"
            checked={hasHeader}
            onChange={(e) => setHasHeader(e.target.checked)}
            className="size-4 accent-primary"
          />
          <Label htmlFor="csv-has-header">{t('hasHeader')}</Label>
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-foreground">{t('colonnesTitre')}</legend>
        <p className="text-ui text-muted-foreground">{hasHeader ? t('colonnesAide') : t('colonnesAideSansEnTete')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {COLONNES.map((cle) =>
            champColonne(cle, colonnes[cle], (v) => {
              setColonnes((c) => ({ ...c, [cle]: v }));
              if (v.trim() !== '') setManquantes((m) => m.filter((x) => x !== cle));
            }),
          )}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-foreground">{t('lectureTitre')}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="csv-sign">{t('signConvention')}</Label>
            <Select
              value={OPTION_DE_SIGNE[signConvention]}
              onValueChange={(next) => {
                if (next !== null) setSignConvention(next === OPTION_DE_SIGNE.direction_column ? 'direction_column' : 'amount_signed');
              }}
              items={optionsSigne}
            >
              <SelectTrigger id="csv-sign" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {optionsSigne.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {signConvention === 'direction_column' ? champColonne('direction_column', directionColumn, setDirectionColumn) : null}
        <div className="space-y-1.5">
          <Label htmlFor="csv-thousands">{t('thousandsSeparator')}</Label>
          <Select
            value={milliers === null ? AUCUN : milliers}
            onValueChange={(next) => {
              if (next === null) return;
              setMilliers(next === AUCUN ? null : (next as ThousandsSeparator));
            }}
            items={optionsMilliers}
          >
            <SelectTrigger id="csv-thousands" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {optionsMilliers.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        </div>
      </fieldset>

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
