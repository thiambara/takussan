<?php

namespace App\Services\Radar;

use App\Jobs\Radar\PurgeRadarAdvertiser;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RadarListingStage;
use App\Models\Property;
use App\Models\RadarAdvertiser;
use App\Models\RadarConsent;
use App\Models\RadarListing;
use App\Models\User;
use App\Services\Property\PropertyPublication;
use App\Support\RadarPhone;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2391 (ADR-0077 §8) — la révocation : l'annonceur ne se contacte plus (`do_not_contact_at`, définitif, avec
 * l'empreinte à clé de son numéro), ses accords valides sont retirés (`revoked_at`), ses annonces ouvertes se ferment et
 * **ses biens publiés par le Radar quittent la surface publique et l'index de recherche dans la même requête**. Son compte
 * reste : le supprimer est un geste à part (`features.md` § 2.1), jamais le bloquer — un compte du Radar bloqué reste le
 * candidat que `PhoneLoginService` ouvre par code, et son titulaire reçoit 403 `account_blocked` à chaque essai.
 *
 * Deux entrées, un seul corps ({@see self::apply()}) : le geste de l'opérateur ({@see self::revoke()}, `super_admin`) et
 * le STOP d'un message ({@see RadarConsentWorkflow::recordOutcome()}), qui l'appelle sous ses propres verrous.
 * Ordre des verrous : annonces (par id) → annonceur → biens. La révocation ne demande PAS la prise en charge de l'annonceur :
 * un retrait n'attend pas qu'un autre opérateur libère la sienne.
 *
 * Elle est idempotente : rejouée sur un annonceur déjà `do_not_contact`, elle garde la première date et ne retire que ce qui
 * serait encore public. La purge de ses annonces jamais publiées part en file APRÈS le commit
 * ({@see PurgeRadarAdvertiser}) ; `radar:purge` est le filet.
 *
 * Un bien déjà sorti du public n'est pas touché : ni archivé ni daté de nouveau.
 */
final class AdvertiserRevocation
{
    /** Combien de fois la révocation reprend quand une annonce rejoint l'annonceur pendant sa lecture. */
    private const ATTEMPTS = 3;

    public function __construct(private readonly PropertyPublication $publication) {}

    /**
     * Le geste de l'opérateur.
     *
     * @return array{advertiser: RadarAdvertiser, closed: list<int>, revoked_consents: list<int>, retired_properties: list<int>}
     */
    public function revoke(RadarAdvertiser $advertiser, string $reason, User $by): array
    {
        for ($attempt = 1; $attempt <= self::ATTEMPTS; $attempt++) {
            $done = DB::transaction(fn (): ?array => $this->revokeOnce($advertiser, $reason, $by));
            if ($done !== null) {
                return $done;
            }
        }

        abort_code(409, 'radar.advertiser.busy');
    }

    /**
     * @return array{advertiser: RadarAdvertiser, closed: list<int>, revoked_consents: list<int>, retired_properties: list<int>}|null
     *                                                                                                                                null : les annonces de l'annonceur ont changé pendant la lecture, rien n'a été écrit
     */
    private function revokeOnce(RadarAdvertiser $advertiser, string $reason, User $by): ?array
    {
        // Les annonces d'abord, puis l'annonceur (annonces → annonceur) : une annonce qui le rejoint entre les deux échappe à
        // l'ensemble lu ; on le voit sous le verrou de l'annonceur et on REPREND, sans renverser l'ordre des verrous.
        $listings = RadarListing::query()->where('radar_advertiser_id', $advertiser->getKey())->orderBy('id')->lockForUpdate()->get();
        $locked = RadarAdvertiser::query()->whereKey($advertiser->getKey())->lockForUpdate()->firstOrFail();
        if ($this->listingIds($locked) !== $listings->pluck('id')->map(fn ($id) => (int) $id)->sort()->values()->all()) {
            return null;
        }

        $applied = $this->apply($locked, $listings);

        activity('Admin')
            ->causedBy($by)
            ->performedOn($locked)
            ->withProperties([
                'advertiser_id' => $locked->id,
                'reason' => $reason,
                'listing_ids' => $applied['closed'],
                'revoked_consent_ids' => $applied['revoked_consents'],
                'property_ids' => $applied['retired_properties'],
            ])
            ->event('radar_advertiser_revoked')
            ->log('Annonceur du Radar révoqué');

        return ['advertiser' => $locked->refresh()] + $applied;
    }

    /**
     * Le corps commun, sur un annonceur et ses annonces DÉJÀ verrouillés par l'appelant (annonces → annonceur).
     *
     * @param  Collection<int, RadarListing>  $listings  toutes les annonces de l'annonceur
     * @return array{closed: list<int>, revoked_consents: list<int>, retired_properties: list<int>}
     */
    public function apply(RadarAdvertiser $advertiser, Collection $listings): array
    {
        // La première date reste : un STOP rejoué ou une révocation après un STOP ne la repousse pas.
        $advertiser->do_not_contact_at ??= now();
        // L'empreinte retrouve le numéro même purgé (relue contre `RadarPhone::hmac()` : réécrite seulement si la clé a changé).
        if ($advertiser->phone !== null && $advertiser->phone_hmac !== RadarPhone::hmac($advertiser->phone)) {
            $advertiser->phone_hmac = RadarPhone::hmac($advertiser->phone);
        }
        $advertiser->save();

        $closed = [];
        $open = [RadarListingStage::Extracted, RadarListingStage::Reviewed, RadarListingStage::Contacted, RadarListingStage::Consented];
        foreach ($listings->whereIn('stage', $open) as $listing) {
            $listing->fill(['stage' => RadarListingStage::DoNotContact, 'stage_reason' => null])->save();
            $closed[] = (int) $listing->id;
        }

        $consents = RadarConsent::query()->valid()->where('radar_advertiser_id', $advertiser->id);
        $revoked = (clone $consents)->orderBy('id')->pluck('id')->map(fn ($id) => (int) $id)->all();
        $consents->update(['revoked_at' => now()]);

        $retired = $this->retireProperties($listings);

        // Après le commit : la purge efface des fichiers, qu'une transaction défaite ne rendrait pas.
        PurgeRadarAdvertiser::dispatch($advertiser->id)->afterCommit();

        return ['closed' => $closed, 'revoked_consents' => $revoked, 'retired_properties' => $retired];
    }

    /** @return list<int> toutes les annonces de l'annonceur, dans l'ordre croissant (relues, jamais verrouillées ici) */
    public function listingIds(RadarAdvertiser $advertiser): array
    {
        return RadarListing::query()->where('radar_advertiser_id', $advertiser->id)->orderBy('id')->pluck('id')->map(fn ($id) => (int) $id)->all();
    }

    /**
     * Les biens publiés par le Radar sortent du public : archivés (la voie de l'archivage en lot, {@see PropertyPublication}),
     * donc hors des routes publiques ; l'observateur de Scout les retire de l'index à la sauvegarde, et `reindexer()` le redit
     * après le commit (il juge `shouldBeSearchable()`).
     *
     * @param  Collection<int, RadarListing>  $listings
     * @return list<int> les biens qui ont changé
     */
    private function retireProperties(Collection $listings): array
    {
        $ids = $listings->whereNotNull('property_id')->pluck('property_id')->map(fn ($id) => (int) $id)->unique()->sort()->values()->all();
        if ($ids === []) {
            return [];
        }

        $retired = [];
        foreach (Property::query()->whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get() as $property) {
            $inShop = in_array($property->status, PropertyPublication::UNPUBLISHABLE, true);
            if ($property->visibility !== PropertyVisibility::Public && ! $inShop) {
                continue;
            }
            // Vendu, loué, en travaux… : le statut dit déjà quelque chose de vrai, seule la vitrine se ferme.
            $property->forceFill($inShop
                ? $this->publication->archivedAttributes()
                : ['visibility' => PropertyVisibility::Private, 'published_at' => null])->save();
            $property->reindexer();
            $retired[] = (int) $property->id;
        }

        return $retired;
    }
}
