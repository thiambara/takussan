<?php

namespace App\Services\Property;

use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-999 (P15.06, Q5) et TCK-1000 (Q2) — ADR-0036, amendement du 2026-10-19, « ce que le transfert
 * entraîne » : la SEULE implémentation des voies 2 (`invitation_accepted`) et 3 (`manual`), qui
 * réécrivent `properties.user_id` après la création.
 *
 *  - jamais depuis un bailleur : un bien tenu par un bailleur de son agence ne change pas de
 *    titulaire (`property.owner_transfer_forbidden`) ;
 *  - vers un bailleur ACTIF de l'agence du bien, jamais du personnel (la règle de `owner_id` à la
 *    saisie, {@see TitulaireALaSaisie::bailleurActif()}) ;
 *  - un lot sous le bien d'un bailleur ne passe qu'à ce bailleur (Q4, `property.parent_owner_mismatch`) ;
 *  - les baux `draft` dont l'ancien titulaire est le bailleur le suivent ; les autres baux, leurs
 *    paiements et les reversements émis ne bougent pas ;
 *  - journal `owner_transferred`, journal du modèle coupé (ADR-0059 § 4) : la réparation
 *    `properties:repair-reassigned-owners` ne relit que les `updated` qui changent `user_id`, et
 *    déferait le transfert ;
 *  - le bailleur est prévenu après le commit (`property.assigned_to_owner`, Q6).
 */
final class PropertyOwnerTransfer
{
    public const VOIE_MANUELLE = 'manual';

    public const VOIE_INVITATION = 'invitation_accepted';

    public const EVENT = 'owner_transferred';

    public function __construct(private readonly TitulaireALaSaisie $titulaires) {}

    /**
     * Le code du refus, ou `null` si `$bien` peut passer à `$bailleur`. Ne lève rien, n'écrit rien :
     * l'acceptation d'une invitation s'en sert pour laisser le bien à l'agence sans échouer.
     */
    public function refus(Property $bien, User $bailleur): ?string
    {
        if ($bien->agency_id === null || TitulaireALaSaisie::tenuParUnBailleur($bien)) {
            return 'property.owner_transfer_forbidden';
        }

        if (! $this->titulaires->bailleurActif((int) $bailleur->id, (int) $bien->agency_id)) {
            return 'property.owner_not_in_agency';
        }

        $parent = $bien->parent_id !== null ? Property::query()->find($bien->parent_id) : null;
        if ($parent !== null && TitulaireALaSaisie::tenuParUnBailleur($parent) && (int) $parent->user_id !== (int) $bailleur->id) {
            return 'property.parent_owner_mismatch';
        }

        return null;
    }

    /**
     * L'aperçu du geste : ce qui suit le bien et ce qui reste. Lève 422 sur le refus du transfert.
     *
     * @return array{passent: Collection<int, Lease>, restent: Collection<int, Lease>}
     */
    public function apercu(Property $bien, User $bailleur): array
    {
        $this->exiger($bien, $bailleur);

        return $this->baux($bien);
    }

    /**
     * Le transfert, dans une transaction, la ligne du bien verrouillée (piège PostgreSQL n° 2) : le
     * refus est rejugé sous le verrou. Rend les identifiants des baux passés et gardés.
     *
     * @return array{leases_moved: list<int>, leases_kept: list<int>}
     */
    public function transfer(Property $property, User $owner, ?User $actor, string $voie): array
    {
        return DB::transaction(function () use ($property, $owner, $actor, $voie): array {
            $bien = Property::query()->whereKey($property->getKey())->lockForUpdate()->firstOrFail();
            $this->exiger($bien, $owner);
            $ancien = (int) $bien->user_id;

            ['passent' => $passent, 'restent' => $restent] = $this->baux($bien);
            $bilan = [
                'leases_moved' => $passent->pluck('id')->map(fn ($id) => (int) $id)->values()->all(),
                'leases_kept' => $restent->pluck('id')->map(fn ($id) => (int) $id)->values()->all(),
            ];

            // ADR-0059 § 4 — journal du modèle coupé, comme la passation : ce transfert se journalise
            // sous son propre évènement, plus bas.
            $bien->disableLogging()->forceFill(['user_id' => $owner->id])->save();
            if ($bilan['leases_moved'] !== []) {
                Lease::query()->whereIn('id', $bilan['leases_moved'])->toBase()
                    ->update(['landlord_id' => $owner->id, 'updated_at' => now()]);
            }

            $journal = activity('Property')->performedOn($bien);
            if ($actor !== null) {
                $journal->causedBy($actor);
            }
            $journal->withProperties([
                'agency_id' => (int) $bien->agency_id,
                'from_user_id' => $ancien,
                'to_user_id' => (int) $owner->id,
                'via' => $voie,
                ...$bilan,
            ])->event(self::EVENT)->log(self::EVENT);

            DB::afterCommit(fn () => $this->titulaires->prevenir($bien));

            return $bilan;
        });
    }

    private function exiger(Property $bien, User $bailleur): void
    {
        $refus = $this->refus($bien, $bailleur);
        abort_code_if($refus !== null, 422, (string) $refus);
    }

    /**
     * Les baux du bien, partagés : les brouillons de l'ancien titulaire passent, tout le reste reste.
     *
     * @return array{passent: Collection<int, Lease>, restent: Collection<int, Lease>}
     */
    private function baux(Property $bien): array
    {
        $baux = Lease::query()->with('tenant')->where('property_id', $bien->id)->orderBy('id')->get();
        [$passent, $restent] = $baux->partition(
            fn (Lease $bail): bool => $bail->status === LeaseStatus::Draft && (int) $bail->landlord_id === (int) $bien->user_id,
        );

        return ['passent' => $passent->values(), 'restent' => $restent->values()];
    }
}
