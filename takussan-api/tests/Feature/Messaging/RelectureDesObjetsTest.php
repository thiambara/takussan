<?php

namespace Tests\Feature\Messaging;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\MessageType;
use App\Models\Enums\ParticipantRole;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\MaintenanceRequest;
use App\Models\Message;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Messaging\EvenementsDuFil;
use App\Services\Messaging\SujetsDuFil;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-2958 (ADR-0128 § 3) — la relecture d'un objet de carte ou d'événement, pour chaque lecteur.
 *
 * Un jeu de données par type du REGISTRE (`SujetsDuFil::types()`, tiré du code : un type ajouté sans
 * sa ligne ici rougit par le `match` sans défaut). Pour chaque type :
 *
 *  - AC1 — un participant du fil qui ne lit pas l'objet reçoit `{indisponible: true}` et RIEN d'autre ;
 *  - AC3 — pour chaque lecteur type (locataire demandeur, prestataire assigné, bailleur, personnel),
 *    la projection n'est pas vide (son `id`, ses `abilities`), et chacune de ses clés — blocs imbriqués
 *    compris — figure dans le `show` de l'objet pour CE lecteur, avec la même valeur ;
 *  - AC3 bis — aucune projection, pour aucun lecteur, ne porte une clé de téléphone ou d'e-mail, à
 *    quelque profondeur que ce soit (motif dans la clé : `requester_phone`, `visitor_email`…). Témoin :
 *    le `show` du bail rend bien au personnel le téléphone du bailleur (TCK-2906), que la carte tait ;
 *  - AC2 — le locataire demandeur ne lit ni devis ni coût dans la projection d'une intervention, que
 *    le bailleur, le personnel et le prestataire y lisent (le témoin qui écarte une projection vide).
 *
 * Le fil est un groupe SANS contexte : son accès ne dépend que de la participation, et ce qui est
 * jugé est la seule politique de l'objet.
 */
class RelectureDesObjetsTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    private const CLES_DE_CONTACT = '/phone|telephone|email|e_mail/i';

    /** @var array<string, User> */
    private array $acteurs = [];

    private Agency $agency;

    private Property $property;

    private Lease $lease;

    private Customer $fiche;

    /** @return array<string, array{string}> */
    public static function typesDuRegistre(): array
    {
        $lignes = [];
        foreach (SujetsDuFil::types() as $type) {
            $lignes[$type] = [$type];
        }

        return $lignes;
    }

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $landlord = $this->landlordOf($this->agency, ['phone' => '+221770000001', 'phone_verified_at' => now()]);
        $staff = $this->agentOf($this->agency, ['phone' => '+221770000002']);
        $tenant = User::factory()->create(['phone' => '+221770000003']);
        $this->property = Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => $this->agency->id]);
        $this->fiche = Customer::factory()->create(['user_id' => $tenant->id, 'agency_id' => $this->agency->id]);
        $this->lease = Lease::factory()->create([
            'property_id' => $this->property->id,
            'tenant_id' => $this->fiche->id,
            'landlord_id' => $landlord->id,
            'agency_id' => $this->agency->id,
            'agent_id' => $staff->id,
            'status' => LeaseStatus::Active,
        ]);

        $this->acteurs = [
            'locataire' => $tenant,
            'bailleur' => $landlord,
            'personnel' => $staff,
            'prestataire' => $this->providerFor($this->agency, userAttributes: ['phone' => '+221770000004']),
            'candidat' => User::factory()->create(['phone' => '+221770000005']),
            'visiteur' => User::factory()->create(['phone' => '+221770000006']),
            // Participant du fil, sans aucun lien avec les objets.
            'etranger' => User::factory()->create(['phone' => '+221770000007']),
        ];
    }

    /**
     * L'objet du type, ses lecteurs type, et la lecture de son `show` (la ligne de l'échéancier pour une
     * échéance, qui n'a pas de `show`).
     *
     * @return array{objet: Model, lecteurs: list<string>, show: callable(): array<string, mixed>}
     */
    private function fixture(string $type): array
    {
        return match ($type) {
            'maintenance_request' => (function (): array {
                $mr = MaintenanceRequest::factory()->create([
                    'property_id' => $this->property->id,
                    'lease_id' => $this->lease->id,
                    'requester_id' => $this->acteurs['locataire']->id,
                    'assigned_to' => $this->acteurs['prestataire']->id,
                    'status' => MaintenanceStatus::QuoteSubmitted,
                ]);
                $mr->forceFill(['quote_amount' => 50000, 'quote_currency' => 'XOF', 'quote_submitted_at' => now(), 'estimated_cost' => 40000, 'actual_cost' => 45000])->save();

                return [
                    'objet' => $mr,
                    'lecteurs' => ['locataire', 'prestataire', 'bailleur', 'personnel'],
                    'show' => fn (): array => $this->getJson("/api/maintenance-requests/{$mr->id}?include=property,requester,assignee")->assertOk()->json('data'),
                ];
            })(),
            'lease' => [
                'objet' => $this->lease,
                'lecteurs' => ['locataire', 'bailleur', 'personnel'],
                'show' => fn (): array => $this->getJson("/api/leases/{$this->lease->id}?include=landlord,agent")->assertOk()->json('data'),
            ],
            'booking' => (function (): array {
                $booking = Booking::factory()->create([
                    'property_id' => $this->property->id,
                    'agency_id' => $this->agency->id,
                    'customer_id' => Customer::factory()->create(['user_id' => $this->acteurs['candidat']->id, 'agency_id' => $this->agency->id])->id,
                    'created_by_id' => $this->acteurs['candidat']->id,
                    'status' => BookingStatus::Pending,
                ]);

                return [
                    'objet' => $booking,
                    'lecteurs' => ['candidat', 'bailleur', 'personnel'],
                    'show' => fn (): array => $this->getJson("/api/bookings/{$booking->id}")->assertOk()->json('data'),
                ];
            })(),
            'lease_payment' => (function (): array {
                $payment = LeasePayment::factory()->create(['lease_id' => $this->lease->id, 'payer_id' => $this->fiche->id]);

                return [
                    'objet' => $payment,
                    'lecteurs' => ['locataire', 'bailleur', 'personnel'],
                    'show' => fn (): array => collect($this->getJson("/api/leases/{$this->lease->id}/payments")->assertOk()->json('data'))
                        ->firstWhere('id', $payment->id),
                ];
            })(),
            'inventory' => (function (): array {
                $inventory = Inventory::factory()->create([
                    'lease_id' => $this->lease->id,
                    'property_id' => $this->property->id,
                    'tenant_id' => $this->fiche->id,
                    'conducted_by' => $this->acteurs['personnel']->id,
                ]);

                return [
                    'objet' => $inventory,
                    'lecteurs' => ['locataire', 'bailleur', 'personnel'],
                    'show' => fn (): array => $this->getJson("/api/inventories/{$inventory->id}")->assertOk()->json('data'),
                ];
            })(),
            'property_visit' => (function (): array {
                $visit = PropertyVisit::factory()->create([
                    'property_id' => $this->property->id,
                    'visitor_id' => $this->acteurs['visiteur']->id,
                    'visitor_phone' => '+221770000008',
                    'visitor_email' => 'visiteur@example.test',
                ]);

                return [
                    'objet' => $visit,
                    'lecteurs' => ['visiteur', 'bailleur', 'personnel'],
                    'show' => fn (): array => $this->getJson("/api/property-visits/{$visit->id}")->assertOk()->json('data'),
                ];
            })(),
            // TCK-2964 — le bien partagé, NON publié : seuls ceux qui le lisent par `view` le relisent
            // (sa lecture en public est éprouvée par `ConversationCardTest`).
            'property' => (function (): array {
                $bien = Property::factory()->create([
                    'user_id' => $this->property->user_id,
                    'agency_id' => $this->agency->id,
                    'published_at' => null,
                ]);

                return [
                    'objet' => $bien,
                    'lecteurs' => ['bailleur', 'personnel'],
                    'show' => fn (): array => $this->getJson("/api/properties/{$bien->id}")->assertOk()->json('data'),
                ];
            })(),
        };
    }

    /** Un groupe sans contexte, dont tous les acteurs sont membres, avec une carte qui désigne l'objet. */
    private function filAvecCarte(Model $objet): Conversation
    {
        $fil = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Coordination',
            'created_by' => $this->acteurs['personnel']->id,
        ]);
        foreach ($this->acteurs as $acteur) {
            $fil->participants()->attach($acteur->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);
        }
        Message::create([
            'conversation_id' => $fil->id,
            'sender_id' => $this->acteurs['personnel']->id,
            'type' => MessageType::Card->value,
            'content' => 'test.card',
            'metadata' => ['object' => ['type' => SujetsDuFil::typeDe($objet), 'id' => (int) $objet->getKey()], 'code' => 'test.card', 'data' => []],
        ]);

        return $fil;
    }

    /** @return array<string, mixed> l'objet de la carte, tel que `GET …/messages` le rend à `$lecteur` */
    private function objetLuPar(User $lecteur, Conversation $fil): array
    {
        Sanctum::actingAs($lecteur);
        $carte = collect($this->getJson("/api/conversations/{$fil->id}/messages")->assertOk()->json('data'))
            ->firstWhere('type', MessageType::Card->value);
        $this->assertNotNull($carte, 'la carte n\'est pas dans la page');
        $this->assertArrayHasKey('object', $carte);

        return $carte['object'];
    }

    #[DataProvider('typesDuRegistre')]
    public function test_chaque_lecteur_relit_l_objet_et_le_non_lecteur_ne_lit_rien(string $type): void
    {
        ['objet' => $objet, 'lecteurs' => $lecteurs, 'show' => $show] = $this->fixture($type);
        $fil = $this->filAvecCarte($objet);

        // AC1 — le non-lecteur : `{indisponible: true}`, sans autre clé.
        $this->assertSame(['indisponible' => true], $this->objetLuPar($this->acteurs['etranger'], $fil));

        foreach ($lecteurs as $nom) {
            $lecteur = $this->acteurs[$nom];
            $projection = $this->objetLuPar($lecteur, $fil);

            // Non vide : un sous-ensemble vide passerait chaque vérification ci-dessous.
            $this->assertSame($objet->getKey(), $projection['id'] ?? null, "{$type}/{$nom} : projection sans id");
            $this->assertIsArray($projection['abilities'] ?? null, "{$type}/{$nom} : projection sans abilities");
            $this->assertNotEmpty($projection['abilities'], "{$type}/{$nom} : abilities vides");
            $this->assertArrayNotHasKey('indisponible', $projection);

            // AC3 bis — aucune coordonnée, à aucune profondeur.
            $this->assertSame([], $this->clesDeContact($projection), "{$type}/{$nom} : coordonnée dans la projection");

            // AC3 — chaque clé (et sa valeur) est dans le `show` de ce lecteur.
            Sanctum::actingAs($lecteur);
            $this->assertSousEnsemble($projection, $show(), "{$type}/{$nom}");
        }
    }

    /** AC2 — ni devis ni coût pour le locataire demandeur ; le donneur d'ordre et le prestataire les lisent. */
    public function test_le_locataire_demandeur_ne_lit_ni_devis_ni_cout(): void
    {
        ['objet' => $mr] = $this->fixture('maintenance_request');
        $fil = $this->filAvecCarte($mr);

        $locataire = $this->objetLuPar($this->acteurs['locataire'], $fil);
        $this->assertSame([], array_values(array_filter(
            array_keys($locataire),
            fn (string $cle) => str_starts_with($cle, 'quote_') || in_array($cle, ['estimated_cost', 'actual_cost'], true),
        )));

        foreach (['bailleur', 'personnel', 'prestataire'] as $nom) {
            $projection = $this->objetLuPar($this->acteurs[$nom], $fil);
            $this->assertEquals(50000, $projection['quote_amount'] ?? null, "{$nom} lit le devis");
            $this->assertEquals(40000, $projection['estimated_cost'] ?? null, "{$nom} lit l'estimation");
        }
    }

    /** AC3 bis — le témoin : le `show` du bail rend au personnel le téléphone du bailleur ; la carte, non. */
    public function test_le_personnel_ne_lit_pas_le_telephone_du_bailleur_dans_la_carte_du_bail(): void
    {
        $fil = $this->filAvecCarte($this->lease);

        Sanctum::actingAs($this->acteurs['personnel']);
        $show = $this->getJson("/api/leases/{$this->lease->id}?include=landlord")->assertOk()->json('data');
        $this->assertSame('+221770000001', $show['landlord']['phone'] ?? null, 'témoin : le show rend le téléphone');

        $projection = $this->objetLuPar($this->acteurs['personnel'], $fil);
        $this->assertSame($this->acteurs['bailleur']->id, $projection['landlord']['id'] ?? null);
        $this->assertArrayNotHasKey('phone', $projection['landlord']);
    }

    /** Une référence supprimée, absente ou hors registre : indisponible, sans lever. */
    public function test_un_objet_supprime_absent_ou_hors_registre_est_indisponible(): void
    {
        $fil = $this->filAvecCarte($this->lease);
        $mr = MaintenanceRequest::factory()->create(['property_id' => $this->property->id]);
        foreach ([['maintenance_request', $mr->id], ['lease', 999999], ['user', $this->acteurs['personnel']->id], ['lease', null]] as [$type, $id]) {
            Message::create([
                'conversation_id' => $fil->id,
                'sender_id' => $this->acteurs['personnel']->id,
                'type' => MessageType::Card->value,
                'content' => 'test.card',
                'metadata' => ['object' => ['type' => $type, 'id' => $id], 'code' => 'test.card', 'data' => []],
            ]);
        }
        $mr->delete();

        Sanctum::actingAs($this->acteurs['personnel']);
        $objets = collect($this->getJson("/api/conversations/{$fil->id}/messages")->assertOk()->json('data'))
            ->where('type', MessageType::Card->value)
            ->sortBy('id')
            ->pluck('object')
            ->values()
            ->all();

        $this->assertSame($this->lease->id, $objets[0]['id'] ?? null, 'le bail se relit');
        $this->assertSame(array_fill(0, 4, ['indisponible' => true]), array_slice($objets, 1));
    }

    /**
     * AC5 — la page de messages ne relit pas un objet par MESSAGE : 1 puis 10 événements sur la même
     * demande (le fil d'une intervention), le même nombre de requêtes.
     */
    public function test_dix_evenements_d_un_meme_objet_coutent_autant_qu_un(): void
    {
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $this->property->id,
            'requester_id' => $this->acteurs['locataire']->id,
            'assigned_to' => $this->acteurs['prestataire']->id,
        ]);

        $un = $this->requetesDeLaPage(1, fn () => $mr);
        $dix = $this->requetesDeLaPage(10, fn () => $mr);

        $this->assertSame(count($un), count($dix), 'requêtes pour 1 événement : '.count($un).', pour 10 : '.count($dix));
    }

    /**
     * AC5 — 1 puis 10 événements, chacun sur SA demande : les demandes (et leurs médias) se chargent en
     * UNE requête, et les jugements de personnel des politiques et des `abilities` passent par une
     * amorce de page (`MembershipCapabilityResolver::primed()`) — le même nombre de requêtes. Sans
     * l'amorce, mesuré le 2026-11-18 : 40 requêtes pour 1 événement, 238 pour 10 (`agent_profiles`, ~17
     * par demande). Avec : 21 et 21.
     */
    public function test_dix_objets_d_un_meme_type_se_chargent_en_une_requete(): void
    {
        $nouvelle = fn () => MaintenanceRequest::factory()->create([
            'property_id' => $this->property->id,
            'requester_id' => $this->acteurs['locataire']->id,
            'assigned_to' => $this->acteurs['prestataire']->id,
        ]);

        $un = $this->requetesDeLaPage(1, $nouvelle);
        $dix = $this->requetesDeLaPage(10, $nouvelle);

        $demandes = fn (array $requetes) => count(array_filter($requetes, fn (string $sql) => str_contains($sql, 'from "maintenance_requests"')));

        $this->assertSame(1, $demandes($dix), 'les dix demandes en une requête');
        $this->assertSame(count($un), count($dix), 'requêtes pour 1 événement : '.count($un).', pour 10 : '.count($dix));
    }

    /**
     * Les requêtes SQL de `GET …/messages` (lecteur : le personnel) pour `$n` événements, chacun sur
     * l'objet que `$objet()` rend.
     *
     * @param  callable(): MaintenanceRequest  $objet
     * @return list<string>
     */
    private function requetesDeLaPage(int $n, callable $objet): array
    {
        $fil = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Interventions',
            'created_by' => $this->acteurs['personnel']->id,
        ]);
        $fil->participants()->attach($this->acteurs['personnel']->id, ['role' => ParticipantRole::Admin->value, 'joined_at' => now()]);
        for ($i = 0; $i < $n; $i++) {
            app(EvenementsDuFil::class)->ecrire($fil, $objet(), 'maintenance.assigned', ['status' => 'open']);
        }

        Sanctum::actingAs($this->acteurs['personnel']);
        // Une première lecture amorce ce que l'application garde par processus.
        $this->getJson("/api/conversations/{$fil->id}/messages")->assertOk();

        DB::flushQueryLog();
        DB::enableQueryLog();
        $page = $this->getJson("/api/conversations/{$fil->id}/messages")->assertOk()->json('data');
        DB::disableQueryLog();
        $this->assertCount($n, array_filter($page, fn (array $m) => isset($m['object']['id'])), 'chaque événement relit sa demande');

        return array_map(fn (array $q) => (string) $q['query'], DB::getQueryLog());
    }

    /** @return list<string> les chemins des clés de contact, à toute profondeur */
    private function clesDeContact(array $valeur, string $chemin = ''): array
    {
        $trouvees = [];
        foreach ($valeur as $cle => $sous) {
            $ici = $chemin === '' ? (string) $cle : $chemin.'.'.$cle;
            if (is_string($cle) && preg_match(self::CLES_DE_CONTACT, $cle) === 1) {
                $trouvees[] = $ici;
            }
            if (is_array($sous)) {
                array_push($trouvees, ...$this->clesDeContact($sous, $ici));
            }
        }

        return $trouvees;
    }

    /**
     * @param  array<string, mixed>  $projection
     * @param  array<string, mixed>|null  $show
     */
    private function assertSousEnsemble(array $projection, ?array $show, string $ou): void
    {
        $this->assertIsArray($show, "{$ou} : le show ne rend pas l'objet");
        foreach ($projection as $cle => $valeur) {
            $this->assertArrayHasKey($cle, $show, "{$ou} : « {$cle} » n'est pas dans le show");
            if (is_array($valeur) && is_array($show[$cle]) && ! array_is_list($valeur)) {
                foreach ($valeur as $sous => $v) {
                    $this->assertArrayHasKey($sous, $show[$cle], "{$ou} : « {$cle}.{$sous} » n'est pas dans le show");
                    $this->assertEquals($show[$cle][$sous], $v, "{$ou} : « {$cle}.{$sous} » diffère du show");
                }
            } else {
                $this->assertEquals($show[$cle], $valeur, "{$ou} : « {$cle} » diffère du show");
            }
        }
    }
}
