<?php

namespace App\Services\Radar;

use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Property;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\User;
use App\Services\Messaging\PropertyConversationResolver;
use App\Services\Onboarding\HostIndividualOnboardingService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2421 (ADR-0079, amendement « la reprise ») — l'annonceur publié sous mandat qui vérifie son numéro par le lien de
 * réclamation reprend ses biens dans SON espace : les MÊMES biens (ni republication, ni perte de vues ou de demandes), dans la
 * transaction de la réclamation ({@see RadarClaims::claim()}), sous le verrou de l'annonceur, journalisée. Il n'existe pas de
 * chemin vers la reprise sans le code envoyé au numéro de l'annonceur : c'est la réclamation qui l'appelle, et elle seule.
 *
 * **Ce qui suit le bien** : l'espace et le titulaire (journal du modèle coupé, ADR-0059 § 4 : la réparation
 * `properties:repair-reassigned-owners` déferait une écriture de `user_id` journalisée en `updated`) ; ses demandes et ses clics
 * (l'espace, et lui pour destinataire) ; ses visites (lui pour agent) ; ses conversations, transmises après le commit à son
 * nouveau contact principal, lui (TCK-888, ADR-0068 § 3 : l'ancien répondant, titulaire ou collaborateur, quitte le fil) ;
 * ses empreintes de photos ; le compteur `properties_count` des deux espaces. Le contact sur place est déjà son numéro.
 *
 * **Ce qui reste dans l'espace des mandats** : ses prospects (`customers`) — une demande ou une visite reprise ne vise plus
 * un prospect d'un autre espace — et ses collaborateurs, retirés du bien.
 *
 * **Ce qui renvoie au support** ({@see self::transferable()}) : un bien qui porte de la gestion — réservation, bail, facture
 * de prestataire, mise en avant, demande de maintenance, état des lieux, flux de calendrier — ou un lot. Rien de cela ne naît
 * d'une publication sous mandat ; si l'équipe en a créé, le déplacer d'un espace à l'autre est une décision humaine.
 *
 * **Un espace cible suspendu refuse la reprise** ({@see self::SPACE_SUSPENDED}), comme `RadarPublisher::publishClaimed()` :
 * ses biens y quitteraient le public (`Property::agencyIsPublic()`). Ils restent sous mandat, en ligne, jusqu'au rétablissement.
 *
 * Aucun quota n'est rejugé : les biens existent et sont déjà en ligne ; la reprise ne les crée pas.
 */
final class RadarMandateTakeBack
{
    public const EVENT = 'radar_mandate_taken_back';

    /** Un bien sous mandat porte de la gestion ({@see self::transferable()}) : la reprise passe par le support. */
    public const SUPPORT_REQUIRED = 'radar.claim.mandate_support_required';

    /** L'espace de l'annonceur est suspendu : ses biens y quitteraient le public ; ils restent sous mandat. */
    public const SPACE_SUSPENDED = 'radar.claim.space_suspended';

    /** La gestion qu'un bien peut porter et qui ne le suit pas sans le support. */
    public const MANAGEMENT_TABLES = ['bookings', 'leases', 'service_provider_bills', 'property_boosts', 'maintenance_requests', 'inventories', 'property_calendar_feeds'];

    /** @return Builder<Property> les biens encore vivants que le Radar a publiés sous mandat pour cet annonceur */
    public function properties(RadarAdvertiser $advertiser): Builder
    {
        return Property::query()
            ->whereIn('id', RadarListing::query()->where('radar_advertiser_id', $advertiser->id)->whereNotNull('property_id')->select('property_id'))
            ->where('metadata->radar_mandate', true);
    }

    /** Ce que la page de réclamation montre : `null` hors mandat. @return array{properties_count: int}|null */
    public function summary(RadarAdvertiser $advertiser): ?array
    {
        return $advertiser->underMandate() ? ['properties_count' => $this->properties($advertiser)->count()] : null;
    }

    /** Aucun de ses biens sous mandat ne porte de gestion ni de lot. */
    public function transferable(RadarAdvertiser $advertiser): bool
    {
        $ids = $this->properties($advertiser)->select('id');
        foreach (self::MANAGEMENT_TABLES as $table) {
            if (DB::table($table)->whereIn('property_id', $ids)->exists()) {
                return false;
            }
        }

        return ! Property::withTrashed()->whereIn('parent_id', $ids)->exists();
    }

    /** L'espace où la réclamation mettrait les biens de ce compte ({@see HostIndividualOnboardingService::autoOnboard()}) est suspendu. */
    public function spaceSuspended(User $user): bool
    {
        return Agency::query()->where('primary_admin_id', $user->id)->orderBy('id')->first()?->status === AgencyStatus::Suspended;
    }

    /**
     * Sur l'annonceur DÉJÀ verrouillé par la réclamation, dans sa transaction, après la vérification du code : ses biens sous
     * mandat passent à `$user`, dans `$agency`, et la période de mandat se clôt (`mandate_taken_back_at`). Rejugé ici : un bien
     * qui a pris de la gestion depuis la lecture de la page renvoie au support (409), et la réclamation entière se défait.
     *
     * @return list<int> les biens repris
     */
    public function takeBack(RadarAdvertiser $locked, User $user, Agency $agency): array
    {
        $properties = $this->properties($locked)->orderBy('id')->lockForUpdate()->get();
        abort_code_unless($this->transferable($locked), 409, self::SUPPORT_REQUIRED);
        // Relu sous verrou : une suspension a pu passer depuis la lecture de la page.
        $space = Agency::query()->whereKey($agency->getKey())->lockForUpdate()->first(['id', 'status']);
        abort_code_if($space?->status === AgencyStatus::Suspended, 409, self::SPACE_SUSPENDED);

        $ids = $properties->pluck('id')->map(fn ($id) => (int) $id)->all();
        $holders = $properties->pluck('user_id')->filter()->map(fn ($id) => (int) $id)->unique()->values()->all();
        $fromAgencies = $properties->pluck('agency_id')->filter()->map(fn ($id) => (int) $id)->unique()->values()->all();
        $countsByAgency = $properties->filter(fn (Property $property) => $property->agency_id !== null)->countBy('agency_id');

        foreach ($properties as $property) {
            // La trace reste sur le bien (`radar_mandate` faux, pas effacé) : la mention publique (TCK-2422) ne le lit plus.
            $property->disableLogging()->forceFill([
                'agency_id' => $agency->id,
                'user_id' => $user->id,
                'metadata' => ['radar_mandate' => false] + (array) $property->metadata,
            ])->save();
        }

        // `PropertyObserver` ne tient `properties_count` qu'à la création et à la suppression : un changement d'espace s'y reporte ici.
        foreach ($countsByAgency as $from => $count) {
            Agency::query()->whereKey($from)->decrement('properties_count', $count);
        }
        if ($ids !== []) {
            Agency::query()->whereKey($agency->getKey())->increment('properties_count', count($ids));
        }

        $leads = DB::table('property_contact_leads')->whereIn('property_id', $ids);
        (clone $leads)->update(['agency_id' => $agency->id, 'customer_id' => null]);
        (clone $leads)->whereNotNull('recipient_user_id')->update(['recipient_user_id' => $user->id]);
        $visits = DB::table('property_visits')->whereIn('property_id', $ids);
        (clone $visits)->update(['customer_id' => null]);
        (clone $visits)->whereNotNull('agent_id')->update(['agent_id' => $user->id]);
        DB::table('media_fingerprints')->whereIn('property_id', $ids)->update(['agency_id' => $agency->id]);

        $collaborators = DB::table('property_collaborators')->whereIn('property_id', $ids)->orderBy('id')->pluck('id')->map(fn ($id) => (int) $id)->all();
        DB::table('property_collaborators')->whereIn('id', $collaborators)->delete();

        // Le chemin de TCK-888 (ADR-0068 § 3), comme `PrimaryAgentDesignator` : après le commit, chaque fil de prospect passe au
        // contact principal actuel — lui, ses collaborateurs retirés — et l'ancien répondant le quitte (`left_at`).
        $conversations = DB::table('conversations')->whereIn('property_id', $ids)->orderBy('id')->pluck('id')->map(fn ($id) => (int) $id)->all();
        foreach ($ids as $id) {
            DB::afterCommit(fn () => app(PropertyConversationResolver::class)->transmitForProperty($id));
        }

        $locked->forceFill(['mandate_taken_back_at' => now()])->save();

        activity('Radar')
            ->causedBy($user)
            ->performedOn($locked)
            ->withProperties([
                'advertiser_id' => $locked->id,
                'user_id' => $user->id,
                'agency_id' => $agency->id,
                'property_ids' => $ids,
                'from_agency_ids' => $fromAgencies,
                'from_user_ids' => $holders,
                'removed_collaborator_ids' => $collaborators,
                'conversation_ids' => $conversations,
            ])
            ->event(self::EVENT)
            ->log('Biens publiés sous mandat repris par l\'annonceur dans son espace');

        return $ids;
    }
}
