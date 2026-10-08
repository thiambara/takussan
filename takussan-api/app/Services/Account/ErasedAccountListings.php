<?php

namespace App\Services\Account;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Property;
use App\Models\User;
use App\Services\Lead\ContactLeadService;
use App\Services\Model\NotificationService;
use App\Services\Property\PrimaryPropertyContact;
use App\Services\Property\PropertyPublication;

/**
 * TCK-600 — **un compte effacé ne laisse aucun bien public sans contact.**
 *
 * `AccountDeletionService::anonymize()` brouille puis supprime le compte en douceur, et ne lisait
 * aucun bien : `owner` devenait nul, l'agent effacé était écarté par `PrimaryPropertyContact`, et la
 * fiche restait en ligne avec une carte de contact vide (`/contact` → `phone: null`).
 *
 * Appelé APRÈS `$user->delete()` : avant, `owner` et `collaborators.user` résolvent encore le
 * compte, et `PrimaryPropertyContact::for()` le rendrait comme contact. Chaque bien dont le compte
 * était propriétaire ou collaborateur est relu ; s'il n'a plus de contact et qu'il est public ou
 * indexable, il est dépublié par le MODÈLE (`update()`, jamais une écriture de masse : Scout ne
 * retire de l'index et `Auditable` ne journalise que sur `saved`), avec le triplet de
 * `PropertyController::unpublish`. Un bien d'agence qui garde un autre agent reste public : l'agence
 * répond. Les lignes `property_collaborators` du compte effacé sont gardées (parts de commission).
 */
class ErasedAccountListings
{
    public function __construct(
        private readonly PropertyPublication $publication,
        private readonly NotificationService $notifications,
        private readonly ContactLeadService $contacts,
    ) {}

    /** @return list<int> les biens dépubliés */
    public function handle(User $erased): array
    {
        $biens = Property::query()
            ->where(fn ($q) => $q
                ->where('user_id', $erased->id)
                ->orWhereHas('collaborators', fn ($c) => $c->where('user_id', $erased->id)))
            ->with([...PrimaryPropertyContact::eagerLoads(), 'agency'])
            ->get();

        $depublies = [];
        foreach ($biens as $bien) {
            if (PrimaryPropertyContact::for($bien) !== null || ! $this->estEnLigne($bien)) {
                continue;
            }

            $bien->update($this->publication->unpublishedAttributes());
            $depublies[] = $bien->id;

            activity('Property')
                ->performedOn($bien)
                ->withProperties(['erased_user_id' => $erased->id, 'agency_id' => $bien->agency_id])
                ->event('property.unpublished_on_account_erasure')
                ->log('property.unpublished_on_account_erasure');

            $this->prevenirLAgence($bien);
        }

        return $depublies;
    }

    private function estEnLigne(Property $bien): bool
    {
        return $bien->shouldBeSearchable()
            || Property::query()->whereKey($bien->id)->public()->exists();
    }

    private function prevenirLAgence(Property $bien): void
    {
        $cible = NotificationTarget::of('property', $bien->id);
        foreach ($this->contacts->agencyAdmins($bien->agency_id) as $admin) {
            $this->notifications->send($admin, NotificationCode::PropertyUnpublishedContactErased, [
                'property' => (string) $bien->title,
                'reference' => (string) $bien->reference_number,
                'url' => rtrim((string) config('app.frontend_url'), '/').$cible->path(),
            ], $cible);
        }
    }
}
