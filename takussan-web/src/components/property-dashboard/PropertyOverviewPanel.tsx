'use client';

import { ArrowRight, MapPin, Pencil } from 'lucide-react';

import { StatCard } from '@/components/charts/StatCard';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/format';
import type { PropertyDetail } from '@/types/property';

type TabKey = 'overview' | 'edit' | 'media' | 'history';

interface Props {
  readonly property: PropertyDetail;
  readonly onJumpTo: (tab: TabKey) => void;
}

interface ChecklistItem {
  readonly id: string;
  readonly label: string;
  readonly done: boolean;
  readonly target: TabKey;
}

function buildChecklist(property: PropertyDetail): ChecklistItem[] {
  const description = (property.description ?? '').trim();
  return [
    {
      id: 'description',
      label: 'Rédiger une description (≥ 80 caractères)',
      done: description.length >= 80,
      target: 'edit',
    },
    {
      id: 'gps',
      label: 'Placer le marqueur GPS',
      done:
        property.location?.latitude != null &&
        property.location?.longitude != null,
      target: 'edit',
    },
    {
      id: 'cover',
      label: 'Ajouter au moins une photo (couverture)',
      done: Boolean(property.main_photo_url),
      target: 'media',
    },
    {
      id: 'title-type',
      label: 'Renseigner le type de titre foncier',
      done: Boolean(property.title_type),
      target: 'edit',
    },
  ];
}

export function PropertyOverviewPanel({ property, onJumpTo }: Props) {
  const checklist = buildChecklist(property);
  const remaining = checklist.filter((c) => !c.done);
  const recentPrices = property.price_history?.slice(0, 5) ?? [];
  const fullAddress =
    property.location?.full ||
    [
      property.location?.street,
      property.location?.quarter,
      property.location?.city,
      property.location?.region,
    ]
      .filter(Boolean)
      .join(', ');

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Vues"
          value={property.views_count ?? 0}
          hint="Sur la fiche publique"
        />
        <StatCard
          label="Favoris"
          value={property.favorites_count ?? 0}
          hint="Utilisateurs ayant épinglé"
        />
        <StatCard
          label="Note moyenne"
          value={
            property.average_rating != null
              ? property.average_rating.toFixed(1)
              : '—'
          }
          hint={`${property.reviews_count ?? 0} avis`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl bg-app-surface-1 p-6">
          <header className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-app-ink">Adresse</h2>
              <p className="text-xs text-app-ink-muted">
                Localisation visible sur la fiche publique.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onJumpTo('edit')}
            >
              <Pencil aria-hidden="true" />
              Modifier
            </Button>
          </header>
          <p className="mt-4 flex items-start gap-2 text-sm text-app-ink">
            <MapPin
              className="mt-0.5 size-4 shrink-0 text-app-ink-muted"
              aria-hidden="true"
            />
            <span>{fullAddress || 'Adresse à compléter'}</span>
          </p>
          <p className="mt-2 text-xs text-app-ink-muted">
            {property.location?.latitude != null &&
            property.location?.longitude != null
              ? `${property.location.latitude.toFixed(5)}, ${property.location.longitude.toFixed(5)}`
              : 'Coordonnées GPS non renseignées'}
          </p>
        </section>

        <section className="rounded-xl bg-app-surface-1 p-6">
          <header className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-app-ink">À régler</h2>
              <p className="text-xs text-app-ink-muted">
                {remaining.length === 0
                  ? 'Tout est en ordre.'
                  : `${remaining.length} élément${remaining.length > 1 ? 's' : ''} à compléter.`}
              </p>
            </div>
          </header>
          <ul className="mt-4 space-y-2">
            {checklist.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span
                  className={
                    item.done ? 'text-app-ink-muted line-through' : 'text-app-ink'
                  }
                >
                  {item.done ? '✓ ' : '○ '}
                  {item.label}
                </span>
                {!item.done ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onJumpTo(item.target)}
                  >
                    Compléter
                    <ArrowRight aria-hidden="true" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-xl bg-app-surface-1 p-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-app-ink">
              Historique des prix
            </h2>
            <p className="text-xs text-app-ink-muted">
              5 dernières évolutions enregistrées.
            </p>
          </div>
          {property.price_history && property.price_history.length > 5 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onJumpTo('history')}
            >
              Voir tout
              <ArrowRight aria-hidden="true" />
            </Button>
          ) : null}
        </header>
        {recentPrices.length === 0 ? (
          <p className="mt-4 text-sm text-app-ink-muted">
            Aucune évolution de prix enregistrée pour le moment.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-app-surface-2 text-sm">
            {recentPrices.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <span className="text-app-ink-muted">
                  {entry.changed_at?.slice(0, 10) ?? 'Date inconnue'}
                </span>
                <span className="font-medium text-app-ink">
                  {formatCurrency(entry.old_price, 'fr', { currency: entry.currency })}{' '}
                  →{' '}
                  {formatCurrency(entry.new_price, 'fr', { currency: entry.currency })}
                </span>
                {entry.reason ? (
                  <span className="basis-full text-xs text-app-ink-muted">
                    {entry.reason}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
