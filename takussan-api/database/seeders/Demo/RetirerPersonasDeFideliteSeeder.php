<?php

namespace Database\Seeders\Demo;

use App\Models\Activity;
use App\Models\Address;
use App\Models\Agency;
use App\Models\Invitation;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\PersonalAccessToken;
use Throwable;

/**
 * TCK-2798 — retire EXACTEMENT ce que {@see PersonasDeFideliteSeeder} a semé, et ce que les gestes faits avec ses
 * personas y ont accroché (une invitation acceptée, un espace créé, un jeton de relevé, une ligne de journal).
 *
 *   php artisan db:seed --class='Database\Seeders\Demo\RetirerPersonasDeFideliteSeeder'
 *
 * Le périmètre se lit, il ne se devine pas : les comptes dont l'e-mail FINIT par `@personas.takussan.test`, les
 * deux agences par leur slug, et les agences dont l'un de ces comptes est le titulaire. Tout le reste en descend :
 * biens et demandes de ces agences, invitations de ces agences ou adressées au domaine, profils de ces agences ou
 * de ces comptes, profils brouillons désignés par ces invitations. Une ligne de la démo qui en dépendrait (une
 * visite d'un compte de la démo sur un bien des personas) fait échouer le retrait sur sa clé étrangère : la
 * transaction est alors annulée entière, et rien n'est retiré à moitié.
 *
 * Suppression définitive (`forceDelete` de requête, sans événements de modèle), dans l'ordre que les clés
 * `RESTRICT` imposent : demande, bien, invitation, profils et collaborations, agence, compte. L'index de recherche
 * est purgé APRÈS le commit (le semeur n'indexe rien ; un geste a pu indexer une persona).
 */
class RetirerPersonasDeFideliteSeeder extends Seeder
{
    public function run(): void
    {
        PersonasDeFideliteSeeder::refuserHorsDuPoste();
        /** @var array<class-string<Model>, Collection<int, Model>> $indexes */
        $indexes = [];
        $comptes = PersonasDeFideliteSeeder::sansEffetsDeBord(fn () => DB::transaction(function () use (&$indexes): array {
            return $this->retirer($indexes);
        }));

        foreach ($indexes as $modeles) {
            if ($modeles->isEmpty()) {
                continue;
            }
            try {
                $modeles->unsearchable();
            } catch (Throwable) {
                $this->command?->getOutput()?->writeln('    ! index de recherche injoignable : '.class_basename($modeles->first()).' non purgé (rien n\'y avait été semé).');
            }
        }

        $resume = collect($comptes)->filter()->map(fn (int $n, string $table) => "{$table} {$n}")->implode(', ');
        $this->command?->getOutput()?->writeln('  > Personas de fidélité retirées (TCK-2798) : '.($resume !== '' ? $resume : 'rien à retirer').'.');
    }

    /**
     * @param  array<class-string<Model>, Collection<int, Model>>  $indexes
     * @return array<string, int>
     */
    private function retirer(array &$indexes): array
    {
        $users = User::withTrashed()->where('email', 'like', '%@'.PersonasDeFideliteSeeder::DOMAINE)->get();
        $userIds = $users->modelKeys();

        $agences = Agency::withTrashed()
            ->whereIn('slug', [PersonasDeFideliteSeeder::AGENCE, PersonasDeFideliteSeeder::ESPACE_HOTE])
            ->orWhereIn('primary_admin_id', $userIds)
            ->get();
        $agenceIds = $agences->modelKeys();

        $biens = Property::withTrashed()->whereIn('agency_id', $agenceIds)->get();
        $demandes = MaintenanceRequest::withTrashed()->whereIn('property_id', $biens->modelKeys())->get();

        $invitations = Invitation::query()
            ->whereIn('agency_id', $agenceIds)
            ->orWhere('email', 'like', '%@'.PersonasDeFideliteSeeder::DOMAINE)
            ->get();

        // Les profils prestataire : ceux des comptes, et les brouillons (sans titulaire, ou d'un compte des
        // personas) que désignent les invitations — jamais le profil d'un prestataire de la démo.
        $designes = $invitations
            ->where('invitable_type', (new ServiceProviderProfile)->getMorphClass())
            ->pluck('invitable_id')
            ->all();
        $prestataires = ServiceProviderProfile::withTrashed()
            ->whereIn('user_id', $userIds)
            ->orWhere(fn ($q) => $q->whereIn('id', $designes)->whereNull('user_id'))
            ->pluck('id')
            ->all();

        $collaborations = ServiceProviderAgencyCollaboration::withTrashed()
            ->whereIn('agency_id', $agenceIds)
            ->orWhereIn('service_provider_profile_id', $prestataires)
            ->pluck('id')
            ->all();
        $profils = [];
        foreach ([OwnerProfile::class, AgentProfile::class, AgencyAdminProfile::class] as $classe) {
            $profils[$classe] = $classe::withTrashed()->whereIn('agency_id', $agenceIds)->orWhereIn('user_id', $userIds)->pluck('id')->all();
        }

        $compte = [];
        $compte['activity_log'] = $this->journal([
            User::class => $userIds,
            Agency::class => $agenceIds,
            Property::class => $biens->modelKeys(),
            MaintenanceRequest::class => $demandes->modelKeys(),
            Invitation::class => $invitations->modelKeys(),
            ServiceProviderProfile::class => $prestataires,
            ServiceProviderAgencyCollaboration::class => $collaborations,
            ...$profils,
        ], $userIds);

        $compte['maintenance_requests'] = MaintenanceRequest::withTrashed()->whereKey($demandes->modelKeys())->forceDelete();
        $compte['addresses'] = Address::query()
            ->where(fn ($q) => $q->where('addressable_type', (new Property)->getMorphClass())->whereIn('addressable_id', $biens->modelKeys()))
            ->orWhere(fn ($q) => $q->where('addressable_type', (new User)->getMorphClass())->whereIn('addressable_id', $userIds))
            ->orWhere(fn ($q) => $q->where('addressable_type', (new Agency)->getMorphClass())->whereIn('addressable_id', $agenceIds))
            ->delete();
        $compte['properties'] = Property::withTrashed()->whereKey($biens->modelKeys())->forceDelete();
        $compte['invitations'] = Invitation::query()->whereKey($invitations->modelKeys())->delete();

        $compte['service_provider_agency_collaborations'] = ServiceProviderAgencyCollaboration::withTrashed()->whereKey($collaborations)->forceDelete();
        $compte['service_provider_profiles'] = ServiceProviderProfile::withTrashed()->whereKey($prestataires)->forceDelete();
        foreach ($profils as $classe => $ids) {
            $compte[(new $classe)->getTable()] = $classe::withTrashed()->whereKey($ids)->forceDelete();
        }

        // `agency_roles`, `notification_preferences` et les autres dépendances en cascade partent avec leur parent.
        $compte['agencies'] = Agency::withTrashed()->whereKey($agenceIds)->forceDelete();
        $compte['personal_access_tokens'] = PersonalAccessToken::query()
            ->where('tokenable_type', (new User)->getMorphClass())
            ->whereIn('tokenable_id', $userIds)
            ->delete();
        $compte['users'] = User::withTrashed()->whereKey($userIds)->forceDelete();

        $indexes = [User::class => $users, Agency::class => $agences, Property::class => $biens, MaintenanceRequest::class => $demandes];

        return $compte;
    }

    /**
     * Le journal d'activité des lignes retirées (sujet) et des comptes retirés (auteur). Le semeur n'en écrit
     * aucune ; un geste fait avec une persona, si.
     *
     * @param  array<class-string<Model>, list<int>>  $sujets
     * @param  list<int>  $auteurs
     */
    private function journal(array $sujets, array $auteurs): int
    {
        $requete = Activity::query()->where(fn ($q) => $q
            ->where('causer_type', (new User)->getMorphClass())
            ->whereIn('causer_id', $auteurs));
        foreach ($sujets as $classe => $ids) {
            if ($ids !== []) {
                $requete->orWhere(fn ($q) => $q->where('subject_type', (new $classe)->getMorphClass())->whereIn('subject_id', $ids));
            }
        }

        return $requete->delete();
    }
}
