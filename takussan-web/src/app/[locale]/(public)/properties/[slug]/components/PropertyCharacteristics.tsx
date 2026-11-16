import { useLocale, useTranslations } from 'next-intl';

import { DEFAULT_LOCALE, isLocale } from '@/i18n/config';
import { formatDate } from '@/lib/format';
import { disponibiliteDe } from '@/lib/property-availability';
import { ESPACES_DES_LIBELLES_DE_BIEN, libelleDeBien } from '@/lib/biens/libelles-de-bien';
import { statutPourLeVisiteur } from '@/lib/biens/statut-au-visiteur';
import type { PropertyDetail } from '@/types/property';

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex justify-between py-3 border-b border-border">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

export function PropertyCharacteristics({ property }: { property: PropertyDetail }) {
  const t = useTranslations('propertyDetail');
  // TCK-351 — les codes se traduisent ici, par le dictionnaire du front : l'API n'émet plus de `*_label`.
  const tType = useTranslations(ESPACES_DES_LIBELLES_DE_BIEN.type);
  const tContrat = useTranslations(ESPACES_DES_LIBELLES_DE_BIEN.contract_type);
  const tPeriode = useTranslations(ESPACES_DES_LIBELLES_DE_BIEN.rent_period);
  const tStatut = useTranslations(ESPACES_DES_LIBELLES_DE_BIEN.status);
  const tTitre = useTranslations(ESPACES_DES_LIBELLES_DE_BIEN.title_type);
  const tEtat = useTranslations(ESPACES_DES_LIBELLES_DE_BIEN.condition);
  const localeBrute = useLocale();
  const locale = isLocale(localeBrute) ? localeBrute : DEFAULT_LOCALE;
  /**
   * TCK-489 — la date de disponibilité s'écrivait, se filtrait, et ne s'affichait nulle part.
   *
   * `disponibiliteDe` porte les quatre cas — clé absente, clé nulle, date à venir, date passée —
   * et lit la pertinence dans `field-matrix.ts` : rien ne s'affiche sur une vente. La ligne rend
   * `null` dans les deux premiers cas, et le filtre de `visible` la retire alors comme les autres.
   */
  const disponibilite = disponibiliteDe(property);
  const rows: Array<{ label: string; value: string | number | null | undefined }> = [
    { label: t('rows.type'), value: libelleDeBien(tType, 'type', property.type) },
    { label: t('rows.contract'), value: libelleDeBien(tContrat, 'contract_type', property.contract_type) },
    { label: t('rows.period'), value: libelleDeBien(tPeriode, 'rent_period', property.rent_period) },
    // TCK-2638 — ni « Validé » ni « Disponible » au visiteur (`statutPourLeVisiteur`).
    { label: t('rows.status'), value: statutPourLeVisiteur(property, tStatut) },
    {
      label: t('rows.floor'),
      value:
        property.floor_number !== null && property.total_floors
          ? `${property.floor_number} / ${property.total_floors}`
          : property.floor_number ?? property.total_floors ?? null,
    },
    // TCK-508 — l'état COMPLET, les cinq valeurs : la fiche est le seul endroit où « À rénover »
    // se lit. Le libellé vient du dictionnaire du front (TCK-351).
    { label: t('rows.condition'), value: libelleDeBien(tEtat, 'condition', property.condition) },
    { label: t('rows.yearBuilt'), value: property.year_built },
    { label: t('rows.parking'), value: property.parking_spaces },
    { label: t('rows.furnished'), value: property.furnished ? t('rows.yes') : null },
    { label: t('rows.titleDeed'), value: libelleDeBien(tTitre, 'title_type', property.title_type) },
    {
      label: t('rows.availability'),
      value: disponibilite
        ? disponibilite.etat === 'immediate'
          ? t('rows.availabilityNow')
          : t('rows.availabilityFrom', { date: formatDate(disponibilite.date, locale) })
        : null,
    },
  ];

  const visible = rows.filter((r) => r.value !== null && r.value !== undefined && r.value !== '');
  if (visible.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-foreground">{t('characteristics')}</h2>
      <div className="grid sm:grid-cols-2 gap-x-8 text-sm">
        {visible.map((r) => (
          <Row key={r.label} label={r.label} value={r.value} />
        ))}
      </div>
    </section>
  );
}
