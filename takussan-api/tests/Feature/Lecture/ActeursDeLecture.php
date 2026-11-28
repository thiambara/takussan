<?php

namespace Tests\Feature\Lecture;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Http\Request;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-3016 (ADR-0138 § 3) — le décor de « qui peut lire », partagé par la garde de parité
 * ({@see ListeEtFicheParityTest}) et la table de décision ({@see QuiPeutLireTest}) : les mêmes
 * acteurs, les mêmes biens, le même profil actif. Deux décors auraient laissé la table et la parité
 * éprouver deux mondes différents.
 *
 * À appeler depuis `setUp()` : {@see self::poserLesActeurs()}.
 */
trait ActeursDeLecture
{
    use CreatesAgencyMembers;

    protected const SUPER = 'super-admin';

    protected const ADMIN = 'personnel actif (admin de A)';

    protected const AGENT = 'agent de A';

    protected const PARTI = 'personnel parti de A';

    protected const BAILLEUR = 'bailleur de A';

    protected const LOCATAIRE = 'locataire';

    protected const CLIENT = 'client';

    protected const ETRANGER = 'étranger (agent de B)';

    protected const DOUBLE = 'profil dans deux agences (actif : B)';

    private Agency $a;

    private Agency $b;

    /** @var array<string, User> */
    private array $acteurs = [];

    /** Le profil actif du compte à deux agences : son profil d'agent dans B. */
    private AgentProfile $profilDuDouble;

    private Customer $ficheDuLocataire;

    private Customer $ficheDuClient;

    /** @var array<string, Property> */
    private array $biens = [];

    private function poserLesActeurs(): void
    {
        $this->a = Agency::factory()->create();
        $this->b = Agency::factory()->create();

        $super = User::factory()->withTwoFactor()->create();
        $this->materializeRoleProfile($super, 'super_admin');

        $parti = $this->agencyAgent($this->a);
        AgentProfile::query()->where('user_id', $parti->id)->delete();

        $double = $this->agencyAgent($this->a);
        $this->profilDuDouble = AgentProfile::factory()->create(['user_id' => $double->id, 'agency_id' => $this->b->id]);

        $bailleur = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $this->a->id]);

        $locataire = User::factory()->create();
        $client = User::factory()->create();

        $this->acteurs = [
            self::SUPER => $super,
            self::ADMIN => $this->agencyAdmin($this->a),
            self::AGENT => $this->agencyAgent($this->a),
            self::PARTI => $parti,
            self::BAILLEUR => $bailleur,
            self::LOCATAIRE => $locataire,
            self::CLIENT => $client,
            self::ETRANGER => $this->agencyAgent($this->b),
            self::DOUBLE => $double,
        ];

        $this->ficheDuLocataire = Customer::factory()->create(['agency_id' => $this->a->id, 'user_id' => $locataire->id]);
        $this->ficheDuClient = Customer::factory()->create(['agency_id' => $this->a->id, 'user_id' => $client->id]);
    }

    private function acteur(string $nom): User
    {
        return $this->acteurs[$nom];
    }

    /**
     * Les biens du décor : dans A (au bailleur, puis saisi par un agent), dans B, hors agence, et
     * dans A supprimé en douceur — la ligne qu'ADR-0138 § 4 juge sur l'agence du bien.
     *
     * @return array<string, Property>
     */
    private function biens(): array
    {
        if ($this->biens !== []) {
            return $this->biens;
        }

        $bailleur = $this->acteur(self::BAILLEUR);
        $corbeille = Property::factory()->create(['agency_id' => $this->a->id, 'user_id' => $bailleur->id]);
        $corbeille->delete();

        return $this->biens = [
            'A' => Property::factory()->create(['agency_id' => $this->a->id, 'user_id' => $bailleur->id]),
            'A, saisi par un agent' => Property::factory()->create(['agency_id' => $this->a->id, 'user_id' => $this->acteur(self::AGENT)->id]),
            'B' => Property::factory()->create(['agency_id' => $this->b->id, 'user_id' => $this->acteur(self::ETRANGER)->id]),
            'hors agence' => Property::factory()->create(['agency_id' => null, 'user_id' => $bailleur->id]),
            'A, en corbeille' => $corbeille,
        ];
    }

    /**
     * Installe la requête que le middleware aurait résolue pour cet acteur (`ResolveActiveProfile` :
     * le profil d'agent dans B pour le compte à deux agences) et rend l'acteur relu, sans rien de
     * mémorisé du précédent.
     */
    private function sousLeProfilActif(User $acteur): User
    {
        $requete = Request::create('/');
        if ($acteur->is($this->acteur(self::DOUBLE))) {
            $requete->attributes->set('active_profile', $this->profilDuDouble);
        }
        $this->app->instance('request', $requete);

        return $acteur->fresh();
    }
}
