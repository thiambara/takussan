<?php

namespace Tests\Feature\Public;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Document;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\GeoRegion;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyContact;
use App\Models\Review;
use App\Models\Tag;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\Route as RouteFacade;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\Support\RemoteDiskFake;
use Tests\TestCase;

/**
 * TCK-633 (lot C, tour 3) — décision de la session sur D10 : **aucun numéro principal non
 * vérifié n'est servi au public, sur aucune surface.** La règle vit en un seul point,
 * {@see User::numeroPrincipalPublic()} ; ce test la garde de deux façons.
 *
 * 1. La fiche `/agents/{slug}` — la fuite mesurée par la revérification 2 (P1 à P3) : un
 *    particulier, un agent d'agence, un compte sans annonce.
 * 2. Un BALAYAGE de toutes les routes `GET api/public/*`, lues dans le routeur et non recopiées :
 *    une route publique ajoutée demain est balayée sans qu'on y pense. Le corps entier est fouillé,
 *    sous toutes les écritures du numéro (E.164, chiffres nus, séparateurs).
 */
class NumeroPublieVerifieTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private const NUMERO = '+221771230987';

    private const SECOND = '+221781230654';

    /** Un contact sur place, d'un autre numéro : il n'est pas sous la règle D10 (lot C, réserve 2). */
    private const SUR_PLACE = '+221338005566';

    private const VILLE = 'Ville Balayée';

    private const QUARTIER = 'Quartier Balayé';

    private const AVIS = 'Avis du balayage';

    private const CONTENU_DOCUMENT = 'contenu-du-plan-balaye';

    /** @return array<string, array{string}> */
    public static function comptes(): array
    {
        return [
            'particulier' => ['particulier'],
            'agent d\'agence' => ['agent'],
            'compte sans annonce' => ['sans_annonce'],
        ];
    }

    private function compte(string $cas, bool $verifie): User
    {
        $user = User::factory()->create([
            'username' => 'awa-diop',
            'phone' => self::NUMERO,
            'phone_verified_at' => $verifie ? now() : null,
            'phone_whatsapp' => true,
        ]);

        if ($cas === 'agent') {
            $agence = Agency::factory()->create();
            AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agence->id]);
            Property::factory()->published()->create(['user_id' => $user->id, 'agency_id' => $agence->id]);
        } elseif ($cas === 'particulier') {
            Property::factory()->published()->create(['user_id' => $user->id, 'agency_id' => null]);
        }

        return $user;
    }

    #[DataProvider('comptes')]
    public function test_la_fiche_d_un_compte_ne_sert_pas_un_numero_non_verifie(string $cas): void
    {
        $this->compte($cas, verifie: false);

        $reponse = $this->getJson('/api/public/agents/awa-diop')->assertOk()
            ->assertJsonPath('data.phone', null)
            ->assertJsonPath('data.phone_verified', false);

        $this->assertNumeroAbsent($reponse->getContent(), self::NUMERO, '/api/public/agents/awa-diop');
    }

    #[DataProvider('comptes')]
    public function test_la_fiche_d_un_compte_sert_son_numero_verifie(string $cas): void
    {
        $this->compte($cas, verifie: true);

        $this->getJson('/api/public/agents/awa-diop')->assertOk()
            ->assertJsonPath('data.phone', self::NUMERO)
            ->assertJsonPath('data.phone_verified', true);
    }

    public function test_le_point_unique_de_la_regle(): void
    {
        $user = User::factory()->make(['phone' => self::NUMERO, 'phone_verified_at' => null]);
        $user->secondary_phone = self::SECOND;
        $user->secondary_phone_verified_at = null;
        $this->assertNull($user->numeroPrincipalPublic());
        $this->assertNull($user->numeroSecondairePublic());

        $user->phone_verified_at = now();
        $user->secondary_phone_verified_at = now();
        $this->assertSame(self::NUMERO, $user->numeroPrincipalPublic());
        $this->assertSame(self::SECOND, $user->numeroSecondairePublic());

        $user->phone = '';
        $this->assertNull($user->numeroPrincipalPublic());
    }

    /**
     * Le balayage. Un compte dont les DEUX numéros sont non vérifiés est à la fois particulier
     * (un bien sans agence) et agent d'une agence (un bien de l'agence, avec un contact sur
     * place), auteur d'un avis approuvé sur l'agence et sur le bien. Chaque route
     * `GET api/public/*` est appelée ; aucune ne doit porter l'un des deux numéros.
     *
     * ⚠ PROBANT sur chaque route, pas seulement sur celles qui répondent d'elles-mêmes : la
     * revérification 3 du lot C a mesuré que 8 routes sur 32 répondaient 4xx ou 500 dans le jeu
     * d'origine (paramètre manquant, Meilisearch hors concern, visiteur anonyme) — un numéro
     * ajouté à la carte restait vert. Chaque route a donc sa RECETTE ({@see self::recettes()}) :
     * ses paramètres, et une PREUVE — une chaîne que le corps doit porter pour montrer que la route
     * a bien servi le jeu (le slug du bien, de l'agence…). Une route qui ne répond pas 200, ou qui
     * répond sans la preuve, ÉCHOUE. Une route neuve sans recette échoue aussi : on ne la balaie
     * pas à vide sans le savoir.
     */
    public function test_aucune_route_publique_ne_sert_un_numero_non_verifie(): void
    {
        $jeu = $this->jeuDuBalayage();
        $recettes = $this->recettes($jeu);

        $routes = collect(RouteFacade::getRoutes()->getRoutes())
            ->filter(fn (Route $r) => in_array('GET', $r->methods(), true) && str_starts_with($r->uri(), 'api/public/'))
            ->map(fn (Route $r) => $r->uri())
            ->values();
        $this->assertGreaterThan(20, $routes->count(), 'le balayage doit voir les routes publiques');

        $sansRecette = $routes->diff(array_keys($recettes))->values()->all();
        $this->assertSame([], $sansRecette, 'route publique sans recette : le balayage la jouerait à vide. Ajouter ses paramètres et sa preuve dans recettes().');
        $perimees = collect(array_keys($recettes))->diff($routes)->values()->all();
        $this->assertSame([], $perimees, 'recette sans route : à retirer de recettes()');

        // Les recettes authentifiées en dernier : le garde `sanctum` garde l'appelant résolu
        // d'une requête à l'autre dans un même test, et les routes anonymes doivent l'être.
        $ordre = $routes->sortBy(fn (string $uri) => isset($recettes[$uri]['jeton']) ? 1 : 0)->values();

        // Les routes qui n'ont pas pu être exercées sont toutes nommées d'un coup, pas la première
        // seule : une recette périmée en cache souvent une autre.
        $nonExercees = [];
        foreach ($ordre as $route) {
            $recette = $recettes[$route];
            $entetes = isset($recette['jeton']) ? ['Authorization' => 'Bearer '.$recette['jeton']] : [];
            $prouvee = false;
            foreach ($recette['appels'] as $appel) {
                $reponse = $this->getJson('/'.$appel, $entetes);
                $corps = $this->corps($reponse);

                $this->assertNumeroAbsent($corps, self::NUMERO, $appel);
                $this->assertNumeroAbsent($corps, self::SECOND, $appel);
                if ($reponse->getStatusCode() !== 200 || trim($corps) === '') {
                    $nonExercees[] = "{$appel} → {$reponse->getStatusCode()} ".mb_substr($corps, 0, 200);
                }
                $prouvee = $prouvee || $this->porte($corps, $recette['preuve']);
            }
            if (! $prouvee) {
                $nonExercees[] = "{$route} → aucune réponse ne porte la preuve « {$recette['preuve']} » : la route a répondu sans servir le jeu";
            }
        }
        $this->assertSame([], $nonExercees, 'routes publiques non exercées : le balayage n\'y prouve rien');
    }

    /** La preuve, écrite telle quelle ou telle que `json_encode` l'échappe (« Balay\u00e9e »). */
    private function porte(string $corps, string $preuve): bool
    {
        return str_contains($corps, $preuve) || str_contains($corps, substr((string) json_encode($preuve), 1, -1));
    }

    /**
     * Le jeu du balayage : de quoi faire répondre CHAQUE route avec des données, pas à vide.
     *
     * @return array{agence: Agency, user: User, bienAgence: Property, bienParticulier: Property, document: Document, ville: GeoCity, quartier: GeoNeighborhood, region: GeoRegion, equipement: Tag, jeton: string}
     */
    private function jeuDuBalayage(): array
    {
        // Un disque privé qui ne PRÉSIGNE pas : le fichier part en flux par la route elle-même, et
        // son corps est fouillé comme les autres (une redirection ne montrerait rien).
        RemoteDiskFake::install('r2-private', presigns: false);

        $agence = Agency::factory()->create(['slug' => 'agence-balayee', 'phone' => '+221338001234']);
        $user = User::factory()->create([
            'username' => 'awa-diop',
            'phone' => self::NUMERO,
            'phone_verified_at' => null,
            'phone_whatsapp' => true,
        ]);
        $user->forceFill(['secondary_phone' => self::SECOND, 'secondary_phone_verified_at' => null, 'secondary_phone_whatsapp' => true])->save();
        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agence->id]);

        $commun = ['user_id' => $user->id, 'type' => 'apartment', 'contract_type' => 'rent', 'price' => 350000];
        $bienAgence = Property::factory()->published()->create([...$commun, 'agency_id' => $agence->id, 'slug' => 'bien-agence']);
        $bienParticulier = Property::factory()->published()->create([...$commun, 'agency_id' => null, 'slug' => 'bien-particulier']);
        foreach ([$bienAgence, $bienParticulier] as $bien) {
            Address::factory()->create([
                'addressable_id' => $bien->id,
                'addressable_type' => Property::class,
                'city' => self::VILLE,
                'neighborhood' => self::QUARTIER,
                'latitude' => 14.72,
                'longitude' => -17.47,
            ]);
        }

        // Le contact SUR PLACE emprunte une autre branche de …/contact que le contact principal :
        // le bien d'agence la prend, le bien du particulier garde la branche du principal seul.
        PropertyContact::query()->create(['property_id' => $bienAgence->id, 'label' => 'Gardien', 'phone' => self::SUR_PLACE, 'has_whatsapp' => false, 'position' => 0]);

        foreach ([[Agency::class, $agence->id], [Property::class, $bienAgence->id]] as [$type, $id]) {
            Review::factory()->create([
                'reviewable_type' => $type,
                'reviewable_id' => $id,
                'author_id' => $user->id,
                'is_approved' => true,
                'title' => self::AVIS,
            ]);
        }

        $document = Document::factory()->create([
            'documentable_id' => $bienAgence->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $user->id,
            'metadata' => ['public' => true],
        ]);
        $document->addMedia(UploadedFile::fake()->createWithContent('plan.pdf', self::CONTENU_DOCUMENT))
            ->toMediaCollection('file');

        $region = GeoRegion::factory()->create(['name' => 'Région Balayée', 'slug' => 'region-balayee']);
        $ville = GeoCity::factory()->create(['geo_region_id' => $region->id, 'name' => 'Ville Balayée', 'slug' => 'ville-balayee']);
        $quartier = GeoNeighborhood::factory()->create(['geo_city_id' => $ville->id, 'name' => 'Quartier Balayé', 'slug' => 'quartier-balaye']);
        $equipement = Tag::factory()->create(['name' => 'Équipement balayé', 'slug' => 'equipement-balaye', 'type' => 'amenity', 'status' => 'approved']);

        $this->indexProperties();

        $visiteur = User::factory()->create();

        return [
            'agence' => $agence,
            'user' => $user,
            'bienAgence' => $bienAgence,
            'bienParticulier' => $bienParticulier,
            'document' => $document,
            'ville' => $ville,
            'quartier' => $quartier,
            'region' => $region,
            'equipement' => $equipement,
            'jeton' => $visiteur->createToken('balayage')->plainTextToken,
        ];
    }

    /**
     * Une recette par route `GET api/public/*` : les appels qui la font servir le jeu, et la
     * preuve qu'elle l'a servi. Les routes d'un bien (`{slug}`) sont jouées sur les DEUX biens.
     *
     * @param  array<string, mixed>  $jeu
     * @return array<string, array{appels: list<string>, preuve: string, jeton?: string}>
     */
    private function recettes(array $jeu): array
    {
        /** @var Property $a */
        $a = $jeu['bienAgence'];
        /** @var Property $p */
        $p = $jeu['bienParticulier'];
        $ids = $a->id.','.$p->id;
        $demain = CarbonImmutable::now('Africa/Dakar')->addDay()->format('Y-m-d');
        $parBien = fn (string $suffixe, string $query = '') => [
            "api/public/properties/{$a->slug}{$suffixe}{$query}",
            "api/public/properties/{$p->slug}{$suffixe}{$query}",
        ];

        return [
            'api/public/agencies' => ['appels' => ['api/public/agencies'], 'preuve' => 'agence-balayee'],
            'api/public/agencies/{slug}' => ['appels' => ['api/public/agencies/agence-balayee'], 'preuve' => 'agence-balayee'],
            'api/public/agencies/{slug}/properties' => ['appels' => ['api/public/agencies/agence-balayee/properties'], 'preuve' => 'bien-agence'],
            'api/public/agents' => ['appels' => ['api/public/agents'], 'preuve' => 'awa-diop'],
            'api/public/agents/{slug}' => ['appels' => ['api/public/agents/awa-diop'], 'preuve' => 'awa-diop'],
            'api/public/agents/{slug}/properties' => ['appels' => ['api/public/agents/awa-diop/properties'], 'preuve' => 'bien-agence'],
            'api/public/amenities' => ['appels' => ['api/public/amenities'], 'preuve' => 'equipement-balaye'],
            'api/public/geo/cities' => ['appels' => ['api/public/geo/cities'], 'preuve' => 'ville-balayee'],
            'api/public/geo/cities/{city}' => ['appels' => ['api/public/geo/cities/'.$jeu['ville']->id], 'preuve' => 'ville-balayee'],
            'api/public/geo/neighborhoods' => ['appels' => ['api/public/geo/neighborhoods?city='.$jeu['ville']->id], 'preuve' => 'quartier-balaye'],
            'api/public/geo/regions' => ['appels' => ['api/public/geo/regions'], 'preuve' => 'region-balayee'],
            'api/public/properties' => ['appels' => ['api/public/properties'], 'preuve' => 'bien-agence'],
            'api/public/properties/by-ids' => ['appels' => ['api/public/properties/by-ids?ids='.$ids], 'preuve' => 'bien-agence'],
            'api/public/properties/cities' => ['appels' => ['api/public/properties/cities'], 'preuve' => self::VILLE],
            'api/public/properties/compare' => ['appels' => ['api/public/properties/compare?ids='.$ids], 'preuve' => 'bien-agence'],
            'api/public/properties/discovery' => ['appels' => ['api/public/properties/discovery?near_city='.self::VILLE], 'preuve' => 'bien-agence'],
            'api/public/properties/map' => ['appels' => ['api/public/properties/map?bounds=14,-18,15,-17'], 'preuve' => 'bien-agence'],
            'api/public/properties/neighborhoods' => ['appels' => ['api/public/properties/neighborhoods?city='.self::VILLE], 'preuve' => self::QUARTIER],
            'api/public/properties/search' => ['appels' => ['api/public/properties/search'], 'preuve' => 'bien-agence'],
            'api/public/properties/sitemap' => ['appels' => ['api/public/properties/sitemap'], 'preuve' => 'bien-agence'],
            'api/public/properties/{property}/documents/{document}/file' => [
                'appels' => ["api/public/properties/{$a->id}/documents/{$jeu['document']->id}/file"],
                'preuve' => self::CONTENU_DOCUMENT,
            ],
            'api/public/properties/{slug}' => ['appels' => $parBien(''), 'preuve' => 'bien-particulier'],
            'api/public/properties/{slug}/availability' => ['appels' => $parBien('/availability'), 'preuve' => 'occupied'],
            'api/public/properties/{slug}/contact' => ['appels' => $parBien('/contact'), 'preuve' => self::SUR_PLACE],
            'api/public/properties/{slug}/conversation' => ['appels' => $parBien('/conversation'), 'preuve' => 'bien-particulier', 'jeton' => $jeu['jeton']],
            'api/public/properties/{slug}/review-eligibility' => ['appels' => $parBien('/review-eligibility'), 'preuve' => 'eligible'],
            'api/public/properties/{slug}/reviews' => ['appels' => $parBien('/reviews'), 'preuve' => self::AVIS],
            'api/public/properties/{slug}/similar' => ['appels' => $parBien('/similar'), 'preuve' => 'bien-particulier'],
            'api/public/properties/{slug}/status' => ['appels' => $parBien('/status'), 'preuve' => 'bien-particulier'],
            'api/public/properties/{slug}/visit-slots' => ['appels' => $parBien('/visit-slots', '?date='.$demain), 'preuve' => $demain],
            'api/public/property-types' => ['appels' => ['api/public/property-types'], 'preuve' => 'apartment'],
            'api/public/search-alerts/capabilities' => ['appels' => ['api/public/search-alerts/capabilities'], 'preuve' => 'channels'],
        ];
    }

    /** Le corps tel que le client le reçoit — un fichier servi en flux compris. */
    private function corps(TestResponse $reponse): string
    {
        return $reponse->baseResponse instanceof StreamedResponse
            ? (string) $reponse->streamedContent()
            : (string) $reponse->getContent();
    }

    private function assertNumeroAbsent(string $corps, string $numero, string $surface): void
    {
        // Les neuf chiffres nationaux, avec ou sans séparateur entre eux (« +221771230987 »,
        // « 77 123 09 87 », « 77-123-0987 ») : le numéro ne passe sous aucune écriture.
        $national = substr($numero, 4);
        $motif = '/'.implode('[\s.\-]*', str_split($national)).'/';
        $this->assertDoesNotMatchRegularExpression($motif, $corps, "{$surface} sert le numéro non vérifié {$numero}");
    }
}
