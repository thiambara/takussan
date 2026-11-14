<?php

namespace App\Support\Query;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Agency;
use App\Models\Concerns\HasQueryBuilder;
use App\Models\Enums\InvitationStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Invitation;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Services\Invitation\ServiceProviderInvitationService;
use App\Support\CaseInsensitive;
use App\Support\Http\ParametreUnique;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * TCK-2834 — les invitations d'une agence à un prestataire DÉJÀ INSCRIT ailleurs, en lignes du carnet.
 *
 * Une telle invitation réutilise le profil maître et ne crée aucune collaboration avant l'acceptation
 * (TCK-262) : le carnet, qui part des profils, ne la voyait pas. La ligne est construite depuis
 * l'INVITATION SEULE — jamais depuis le profil — et ne porte que ce que l'agence a saisi : nom,
 * e-mail ou numéro, métiers, zones, date d'invitation. Rien du profil maître (métiers, zones,
 * métadonnées, avis, assurance, compte, autres collaborations), ni même son identifiant : `id` est nul,
 * `pending_invitation_only` la désigne, `pending_invitation_id` porte la relance et la révocation.
 *
 * Une invitation entre ici quand elle est `sent`, de CETTE agence, vers un profil prestataire, marquée
 * `existing_sp_other_agency` par {@see ServiceProviderInvitationService},
 * et que le profil n'a AUCUNE collaboration avec l'agence (un brouillon TCK-2829 en a une `paused`,
 * il sort par la requête des profils). Une seule ligne par profil : la plus récente des invitations.
 *
 * Les filtres du carnet se rejugent ici sur les seules colonnes de l'invitation (recherche, zone,
 * métier, statut `draft`). Un filtre qu'elle ne sait pas juger FERME : aucune ligne.
 */
final class CarnetInvitationsDeProfilsExistants
{
    /** Les filtres que l'invitation sait juger ; `collaboration_status` n'arrive ici que sans valeur connue. */
    private const FILTRES_JUGES = ['search', 'zone', 'specialty', 'status', 'collaboration_status'];

    /**
     * Les lignes du carnet par défaut, plus récente d'abord.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public static function lignes(Agency $agency, Request $request): Collection
    {
        $filtres = $request->input('filter');
        $filtres = is_array($filtres) ? $filtres : [];

        foreach ($filtres as $cle => $valeur) {
            if (! in_array($cle, self::FILTRES_JUGES, true) && self::renseigne($valeur)) {
                return collect();
            }
        }

        $statuts = self::liste($filtres['status'] ?? null);
        if ($statuts !== [] && ! in_array(ServiceProviderProfileStatus::Draft->value, $statuts, true)) {
            return collect();
        }

        $requete = self::perimetre($agency);
        self::rechercher($requete, ParametreUnique::valeur($filtres['search'] ?? null));
        self::contenantUnDe($requete, 'zones', self::liste($filtres['zone'] ?? null));
        self::contenantUnDe($requete, 'trades', self::liste($filtres['specialty'] ?? null));

        return self::unParProfil($requete)->map(fn (Invitation $invitation): array => self::ligne($invitation, $request));
    }

    /**
     * Les zones saisies sur ces invitations, sans filtre : elles rejoignent `meta.zones`.
     *
     * @return list<string>
     */
    public static function zones(Agency $agency): array
    {
        return self::unParProfil(self::perimetre($agency))
            ->flatMap(fn (Invitation $invitation): array => (array) data_get($invitation->metadata, 'intervention_zones', []))
            ->filter(fn ($zone): bool => is_string($zone) && trim($zone) !== '')
            ->values()
            ->all();
    }

    /** @return Builder<Invitation> */
    private static function perimetre(Agency $agency): Builder
    {
        $profil = new ServiceProviderProfile;

        return Invitation::query()
            ->where('invitations.agency_id', $agency->id)
            ->where('invitations.status', InvitationStatus::Sent->value)
            ->where('invitations.invitable_type', $profil->getMorphClass())
            ->where('invitations.metadata->existing_sp_other_agency', true)
            ->whereNotExists(ServiceProviderAgencyCollaboration::query()
                ->selectRaw('1')
                ->whereColumn('service_provider_agency_collaborations.service_provider_profile_id', 'invitations.invitable_id')
                ->where('service_provider_agency_collaborations.agency_id', $agency->id));
    }

    /**
     * La plus récente par profil (deux invitations `sent` d'une agence au même compte — par e-mail
     * et par numéro — peuvent coexister).
     *
     * @param  Builder<Invitation>  $requete
     * @return Collection<int, Invitation>
     */
    private static function unParProfil(Builder $requete): Collection
    {
        return $requete
            ->orderByDesc('invitations.created_at')
            ->orderByDesc('invitations.id')
            ->get()
            ->unique('invitable_id')
            ->values();
    }

    /**
     * Le motif de {@see HasQueryBuilder} (casse repliée, `%` et `_` littéraux) sur
     * le nom saisi, le numéro saisi (aussi sans séparateurs) et les zones saisies — comme
     * {@see ServiceProviderProfile::extraSearchClauses()} sur un brouillon.
     *
     * @param  Builder<Invitation>  $requete
     */
    private static function rechercher(Builder $requete, ?string $valeur): void
    {
        if ($valeur === null || trim($valeur) === '') {
            return;
        }
        $motif = '%'.addcslashes(CaseInsensitive::fold($valeur), '\\%_').'%';
        $chiffres = preg_match('/^[\d\s.+\-()]+$/', $valeur) === 1 ? preg_replace('/\D/', '', $valeur) : '';
        $motifs = array_values(array_unique(array_filter([$motif, strlen((string) $chiffres) >= 3 ? '%'.$chiffres.'%' : null])));

        $requete->where(function (Builder $q) use ($motif, $motifs): void {
            foreach (['first_name', 'last_name'] as $cle) {
                $q->orWhereRaw(CaseInsensitive::sqlCleJson('invitations.metadata', $cle).' like ?', [$motif]);
            }
            $q->orWhereRaw(
                "LOWER(concat_ws(' ', invitations.metadata->>'first_name', invitations.metadata->>'last_name') COLLATE \"".CaseInsensitive::COLLATION.'") like ?',
                [$motif],
            );
            foreach ($motifs as $m) {
                $q->orWhereRaw('invitations.phone like ?', [$m]);
            }
            $q->orWhereRaw("LOWER((invitations.metadata->'intervention_zones')::text COLLATE \"".CaseInsensitive::COLLATION.'") like ?', [$motif]);
        });
    }

    /**
     * @param  Builder<Invitation>  $requete
     * @param  list<string>  $valeurs
     */
    private static function contenantUnDe(Builder $requete, string $quoi, array $valeurs): void
    {
        if ($valeurs === []) {
            return;
        }
        $chemin = $quoi === 'zones' ? 'invitations.metadata->intervention_zones' : 'invitations.metadata->trades';
        $requete->where(function (Builder $q) use ($chemin, $valeurs): void {
            foreach ($valeurs as $valeur) {
                $q->orWhereJsonContains($chemin, $valeur);
            }
        });
    }

    /** @return array<string, mixed> */
    private static function ligne(Invitation $invitation, Request $request): array
    {
        $meta = $invitation->metadata ?? [];
        $colonnes = [
            'id' => null,
            'user_id' => null,
            'status' => ServiceProviderProfileStatus::Draft->value,
            'specialties' => null,
            'service_areas' => null,
            'metadata' => [
                'first_name' => (string) ($meta['first_name'] ?? ''),
                'last_name' => (string) ($meta['last_name'] ?? ''),
                'email' => $invitation->email,
                'phone' => $invitation->phone,
                'trades' => array_values((array) ($meta['trades'] ?? [])),
                'intervention_zones' => array_values((array) ($meta['intervention_zones'] ?? [])),
            ],
            'created_at' => BaseResource::instantOnWire($invitation->created_at),
        ];

        // Les colonnes demandées par `fields[service_provider_profiles]`, comme une ligne de profil.
        $demandees = self::liste($request->input('fields.service_provider_profiles'));
        if ($demandees !== []) {
            $colonnes = array_intersect_key($colonnes, array_flip($demandees));
        }

        $ligne = $colonnes + [
            'pending_invitation_id' => $invitation->id,
            'pending_invitation_only' => true,
            'phone' => $invitation->phone,
            'average_rating' => null,
            'reviews_count' => 0,
            'insured' => false,
            'completed_interventions_count' => 0,
            'response_delay_minutes' => null,
        ];

        // `include=user` rend un compte nul : celui du profil maître n'est pas à l'agence avant l'acceptation.
        if (in_array('user', self::liste($request->input('include')), true)) {
            $ligne['user'] = null;
        }

        return $ligne;
    }

    /** @return list<string> */
    private static function liste(mixed $valeur): array
    {
        $valeurs = is_array($valeur) ? $valeur : explode(',', (string) ParametreUnique::valeur($valeur));

        return array_values(array_filter(array_map(
            fn ($v): string => is_scalar($v) ? trim((string) $v) : '',
            $valeurs,
        ), fn (string $v): bool => $v !== ''));
    }

    private static function renseigne(mixed $valeur): bool
    {
        return is_array($valeur) ? $valeur !== [] : trim((string) ParametreUnique::valeur($valeur)) !== '';
    }
}
