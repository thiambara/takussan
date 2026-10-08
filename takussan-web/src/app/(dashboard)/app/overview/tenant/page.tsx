import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { fetchTenantDashboard, type TenantDashboard } from '@/lib/queries/dashboard';
import { rechercherBiensPublics } from '@/lib/queries/public-search';
import { StatCard } from '@/components/charts/StatCard';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { PageHeader } from '@/components/console';
import { buttonVariants } from '@/components/ui/button';
import type { Locale } from '@/i18n/config';
import { localeDeLaRequete } from '@/i18n/locale-serveur';
import { hrefLocalise } from '@/i18n/navigation';
import type { PropertyListItem } from '@/types/property';
import type { UserPreferences } from '@/types/user';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.overviewTenant');
  return { title: t('metaTitle') };
}

// TCK-179 — les statuts de paiement bruts affichés sur le tableau de bord locataire.
// TCK-292 : la table de libellés est passée au dictionnaire (`dashboard.paymentStatus.*`) ;
// il ne reste ici que la liste des statuts CONNUS, pour ne pas rendre une clé sur un statut
// que le backend inventerait.
const STATUTS_CONNUS = new Set([
  'pending', 'paid', 'partially_paid', 'late', 'refunded', 'cancelled',
]);

function paymentStatusLabel(
  status: string | null | undefined,
  t: (cle: string) => string,
): string {
  if (!status) return '—';
  return STATUTS_CONNUS.has(status) ? t(`paymentStatus.${status}`) : status;
}

/** TCK-032 P1 — tenant dashboard. Any authenticated user can view. */
export default async function TenantDashboardPage() {
  const t = await getTranslations('dashboard');
  const [user, payload, locale] = await Promise.all([
    getMeAction(),
    fetchTenantDashboard(),
    localeDeLaRequete(),
  ]);

  if (!payload) {
    return (
      <PageHeader title={t('tenant.title')} description={t('tenant.loadError')} />
    );
  }
  const data = payload.data;

  // TCK-595 (§ Direction UX) — un compte sans dossier reçoit une invitation à chercher dans sa
  // ville, jamais un état vide générique. Ce qui l'attend (visites, interventions) reste affiché :
  // une demande d'intervention ne suppose pas de dossier client.
  if (!data.has_customer_profile) {
    const invitation = await invitationARechercher(user.preferences, locale);
    return (
      <div className="space-y-6">
        <PageHeader title={t('tenant.title')} description={t('tenant.noProfileInvite')} />
        <CeQuiMAttend data={data} locale={locale} t={t} />
        <InvitationARechercher invitation={invitation} locale={locale} t={t} />
      </div>
    );
  }

  const nextDue = data.payments.next_due;

  return (
    <div className="space-y-6">
      <PageHeader title={t('tenant.title')} description={t('tenant.subtitle')} />

      <CeQuiMAttend data={data} locale={locale} t={t} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('tenant.activeLeases')} value={formatNumber(data.leases.active, locale)} />
        <StatCard
          label={t('tenant.nextRent')}
          value={nextDue ? formatCurrency(nextDue.amount, locale) : '—'}
          hint={nextDue?.due_date ? formatDate(nextDue.due_date, locale) : undefined}
        />
        <StatCard
          label={t('tenant.overdue')}
          value={formatNumber(data.payments.overdue_count, locale)}
          hint={formatCurrency(data.payments.overdue_amount, locale)}
          accent={data.payments.overdue_count > 0 ? 'danger' : 'default'}
        />
        <StatCard
          label={t('tenant.pendingBookings')}
          value={formatNumber(data.bookings.pending, locale)}
        />
      </div>

      <section className="rounded-2xl bg-card p-6">
        <h2 className="mb-3 text-base font-semibold text-foreground">{t('tenant.upcoming30d')}</h2>
        {data.payments.upcoming_30d.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('tenant.noUpcoming')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.payments.upcoming_30d.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-foreground">
                  {p.due_date ? formatDate(p.due_date, locale) : '—'}
                </span>
                <span className="font-semibold text-foreground">
                  {formatCurrency(p.amount, locale)}
                </span>
                <span className="text-xs text-muted-foreground">{paymentStatusLabel(p.status, t)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-card p-6">
        <h2 className="mb-3 text-base font-semibold text-foreground">{t('tenant.recentDocs')}</h2>
        {data.documents.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('tenant.noDocs')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.documents.recent.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-foreground">{d.name}</span>
                <span className="text-xs text-muted-foreground">{d.type ?? '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

type Traducteur = (cle: string, valeurs?: Record<string, string | number>) => string;

/**
 * TCK-595 (AC16) — « ce qui m'attend » : la prochaine visite et les interventions ouvertes. Chaque
 * ligne mène à sa liste.
 */
function CeQuiMAttend({
  data,
  locale,
  t,
}: {
  readonly data: TenantDashboard;
  readonly locale: Locale;
  readonly t: Traducteur;
}) {
  const visites = data.visits?.upcoming ?? [];
  const prochaine = visites[0];
  return (
    <section className="rounded-2xl bg-card p-6" aria-labelledby="ce-qui-m-attend">
      <h2 id="ce-qui-m-attend" className="mb-3 text-base font-semibold text-foreground">
        {t('tenant.whatAwaits')}
      </h2>
      <ul className="space-y-2 text-sm">
        <li>
          <Link
            href={prochaine ? `/app/visits/${prochaine.id}` : '/app/visits'}
            className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="text-muted-foreground">{t('tenant.nextVisit')}</span>
            <span className="text-right font-semibold text-foreground tabular-nums">
              {prochaine
                ? t('tenant.nextVisitAt', {
                    date: formatDate(prochaine.scheduled_at, locale, {
                      dateStyle: undefined,
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                    property: prochaine.property?.title ?? t('tenant.propertyFallback'),
                  })
                : t('tenant.noVisit')}
            </span>
          </Link>
        </li>
        <li>
          <Link
            href="/app/maintenance"
            className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="text-muted-foreground">{t('tenant.openMaintenance')}</span>
            <span className="font-semibold text-foreground tabular-nums">
              {formatNumber(data.maintenance.open, locale)}
            </span>
          </Link>
        </li>
      </ul>
    </section>
  );
}

type Invitation = {
  readonly ville: string | null;
  readonly contrat: 'rent' | 'sale';
  readonly biens: readonly PropertyListItem[];
};

/**
 * La rangée « biens à {ville} » consomme la recherche publique existante (`city`, `contract_type`).
 * Sans ville connue, l'invitation mène à la recherche sans filtre ; une panne de la recherche rend
 * une rangée vide, jamais une erreur.
 */
async function invitationARechercher(
  preferences: UserPreferences | undefined,
  locale: Locale,
): Promise<Invitation> {
  const ville = preferences?.city?.trim() || null;
  const contrat = preferences?.search_intent === 'buy' ? 'sale' : 'rent';
  if (!ville) return { ville, contrat, biens: [] };
  const requete = new URLSearchParams({ city: ville, contract_type: contrat, per_page: '4' }).toString();
  const resultat = await rechercherBiensPublics(requete, locale);
  return { ville, contrat, biens: resultat?.data ?? [] };
}

function InvitationARechercher({
  invitation,
  locale,
  t,
}: {
  readonly invitation: Invitation;
  readonly locale: Locale;
  readonly t: Traducteur;
}) {
  const { ville, contrat, biens } = invitation;
  const filtres = new URLSearchParams({ contract_type: contrat });
  if (ville) filtres.set('city', ville);
  const recherche = hrefLocalise(`/properties?${filtres.toString()}`, locale);
  const titre = ville
    ? t(contrat === 'sale' ? 'tenant.inviteBuyIn' : 'tenant.inviteRentIn', { city: ville })
    : t('tenant.inviteSearch');
  return (
    <section className="rounded-2xl border border-dashed border-border bg-card p-6">
      <h2 className="text-base font-semibold text-foreground">{titre}</h2>
      {biens.length > 0 ? (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {biens.map((bien) => (
            <li key={bien.id}>
              <Link
                href={hrefLocalise(`/properties/${bien.slug}`, locale)}
                className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="min-w-0 truncate text-foreground">{bien.title}</span>
                <span className="shrink-0 font-semibold text-foreground tabular-nums">
                  {formatCurrency(bien.price, locale, { currency: bien.currency ?? 'XOF' })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <Link href={recherche} className={buttonVariants({ className: 'mt-4' })}>
        {t('tenant.inviteCta')}
      </Link>
    </section>
  );
}
