<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\VisitStatus;
use App\Models\Enums\VisitWindow;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Visit\VisitSchedulingService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2744 — un agent n'a qu'une visite confirmée à la fois. Chaque écriture qui pose un agent et une
 * heure sur une visite qui occupe (confirmée, à heure fixée) refuse le chevauchement de SES visites —
 * plus seulement de celles du bien — en 422 `visit.agent_overlap`.
 *
 * Décor commun : l'agent X a une visite confirmée de 10:00 à 10:30 (J+2, heure de Dakar) sur le bien
 * B de son agence ; les écritures visent le bien A de la même agence.
 */
class VisitAgentOverlapTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $x;

    private User $admin;

    private User $agentX;

    private Property $a;

    private Property $b;

    private Property $c;

    private PropertyVisit $occupation;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->x = $this->agence();
        $this->admin = $this->personnel($this->x, 'agency_admin');
        $this->agentX = $this->personnel($this->x);
        $this->a = $this->bienDe($this->x);
        $this->b = $this->bienDe($this->x);
        $this->c = $this->bienDe($this->x);
        $this->occupation = $this->visite($this->b, 10, 0, ['status' => VisitStatus::Confirmed, 'duration_minutes' => 30]);
    }

    /** J+2 à `$heure:$minute`, heure de Dakar. */
    private function h(int $heure, int $minute = 0): CarbonImmutable
    {
        return CarbonImmutable::parse($this->creneau(2, $heure, $minute));
    }

    /** Une visite de X sur `$bien` (en attente par défaut), à `$heure:$minute`. */
    private function visite(Property $bien, int $heure, int $minute = 0, array $attributs = []): PropertyVisit
    {
        return PropertyVisit::factory()->create($attributs + [
            'property_id' => $bien->id,
            'agent_id' => $this->agentX->id,
            'visitor_id' => null,
            'visitor_name' => 'Visiteur',
            'visitor_phone' => '+221770000000',
            'locale' => 'fr',
            'scheduled_at' => $this->h($heure, $minute),
            'duration_minutes' => null,
            'status' => VisitStatus::Scheduled,
            'preferred_window' => null,
        ]);
    }

    private function confirmer(PropertyVisit $visite, ?CarbonImmutable $heure = null, ?User $par = null): TestResponse
    {
        Sanctum::actingAs($par ?? $this->admin);

        return $this->postJson("/api/property-visits/{$visite->id}/confirm", $heure !== null ? ['scheduled_at' => $heure->toIso8601String()] : []);
    }

    private function assertRefus(TestResponse $reponse, string $code = 'visit.agent_overlap'): void
    {
        $reponse->assertStatus(422)->assertJsonPath('code', $code);
    }

    /** @return int les visites confirmées de X qui commencent à `$instant` */
    private function confirmeesDeXA(CarbonImmutable $instant): int
    {
        return PropertyVisit::query()->where('agent_id', $this->agentX->id)->where('status', VisitStatus::Confirmed)
            ->where('scheduled_at', $instant->utc())->count();
    }

    public function test_ac1_confirmer_refuse_l_agent_deja_pris_et_n_ecrit_rien(): void
    {
        $demande = $this->visite($this->a, 10);
        $this->assertRefus($this->confirmer($demande));
        $this->assertSame(VisitStatus::Scheduled, $demande->fresh()->status);
        Notification::assertNothingSent();

        // Une demande par tranche, confirmée en fixant 10:00.
        $tranche = $this->visite($this->a, 9, 0, ['preferred_window' => VisitWindow::Morning]);
        $this->assertRefus($this->confirmer($tranche, $this->h(10)));
        $this->assertSame(VisitWindow::Morning, $tranche->fresh()->preferred_window);
        Notification::assertNothingSent();

        $this->confirmer($this->visite($this->a, 10, 30))->assertOk();
    }

    public function test_ac2_dans_un_meme_lot_la_seconde_visite_de_l_agent_est_refusee(): void
    {
        $surA = $this->visite($this->a, 11);
        $surC = $this->visite($this->c, 11);

        Sanctum::actingAs($this->admin);
        $reponse = $this->postJson('/api/property-visits/bulk-confirm', ['visits' => [['id' => $surA->id], ['id' => $surC->id]]])->assertOk();

        $this->assertTrue($reponse->json('data.0.ok'));
        $this->assertSame(['id' => $surC->id, 'ok' => false, 'code' => 'visit.agent_overlap', 'status' => 422], $reponse->json('data.1'));
        $this->assertSame(['ok' => 1, 'failed' => 1], $reponse->json('meta'));
        $this->assertSame(1, $this->confirmeesDeXA($this->h(11)));
    }

    public function test_ac3_planifier_pour_un_agent_pris_ne_cree_rien(): void
    {
        $avant = PropertyVisit::query()->count();
        Sanctum::actingAs($this->admin);
        $this->assertRefus($this->postJson('/api/property-visits', [
            'property_id' => $this->a->id, 'agent_id' => $this->agentX->id, 'scheduled_at' => $this->h(10)->toIso8601String(),
            'visitor_name' => 'Awa Diop', 'visitor_phone' => '+221771234567',
        ]));
        $this->assertSame($avant, PropertyVisit::query()->count());

        // Sans `agent_id`, l'appelant devient l'agent : X, pris à 10:00.
        Sanctum::actingAs($this->agentX);
        $this->assertRefus($this->postJson('/api/property-visits', [
            'property_id' => $this->a->id, 'scheduled_at' => $this->h(10)->toIso8601String(),
            'visitor_name' => 'Awa Diop', 'visitor_phone' => '+221771234567',
        ]));

        // Depuis une demande de contact, avec création de fiche : la demande reste non traitée, aucune fiche.
        $lead = PropertyContactLead::factory()->create([
            'property_id' => $this->a->id, 'agency_id' => $this->x->id, 'recipient_user_id' => $this->agentX->id,
            'name' => 'Mouhamed Dieng', 'phone' => '+221778103538',
        ]);
        $fiches = Customer::query()->count();
        $this->assertRefus($this->postJson('/api/property-visits', [
            'contact_lead_id' => $lead->id, 'scheduled_at' => $this->h(10)->toIso8601String(), 'create_customer' => true,
        ]));
        $this->assertNull($lead->fresh()->handled_at);
        $this->assertNull($lead->fresh()->customer_id);
        $this->assertSame($fiches, Customer::query()->count());
        $this->assertSame($avant, PropertyVisit::query()->count());
        Notification::assertNothingSent();
    }

    public function test_ac4_deplacer_une_visite_confirmee(): void
    {
        $midi = $this->visite($this->a, 12, 0, ['status' => VisitStatus::Confirmed]);
        Sanctum::actingAs($this->admin);
        $this->assertRefus($this->patchJson("/api/property-visits/{$midi->id}", ['scheduled_at' => $this->h(10)->toIso8601String()]));
        $this->assertTrue($midi->fresh()->scheduled_at->equalTo($this->h(12)));

        $neufHeures30 = $this->visite($this->c, 9, 30, ['status' => VisitStatus::Confirmed, 'duration_minutes' => 30]);
        $this->assertRefus($this->patchJson("/api/property-visits/{$neufHeures30->id}", ['duration_minutes' => 31]));
        $this->assertSame(30, $neufHeures30->fresh()->duration_minutes);
        // La durée actuelle, repassée : la visite ne se chevauche pas elle-même.
        $this->patchJson("/api/property-visits/{$neufHeures30->id}", ['duration_minutes' => 30])->assertOk();
        $neufHeures30->update(['duration_minutes' => 20]);
        $this->patchJson("/api/property-visits/{$neufHeures30->id}", ['duration_minutes' => 30])->assertOk();
    }

    public function test_ac5_attribuer_une_visite_confirmee_a_l_agent_pris(): void
    {
        $agentY = $this->personnel($this->x);
        $visite = $this->visite($this->a, 10, 0, ['status' => VisitStatus::Confirmed, 'agent_id' => $agentY->id]);

        Sanctum::actingAs($this->admin);
        $this->assertRefus($this->patchJson("/api/property-visits/{$visite->id}", ['agent_id' => $this->agentX->id]));
        $this->assertSame($agentY->id, $visite->fresh()->agent_id);

        $lot = $this->postJson('/api/property-visits/bulk-assign', ['ids' => [$visite->id], 'agent_id' => $this->agentX->id])->assertOk();
        $this->assertSame(['id' => $visite->id, 'ok' => false, 'code' => 'visit.agent_overlap', 'status' => 422], $lot->json('data.0'));
        $this->assertSame($agentY->id, $visite->fresh()->agent_id);

        // En attente, elle n'occupe personne : l'attribution passe, par les deux chemins.
        $visite->update(['status' => VisitStatus::Scheduled]);
        $this->patchJson("/api/property-visits/{$visite->id}", ['agent_id' => $this->agentX->id])->assertOk();
        $visite->update(['agent_id' => $agentY->id]);
        $this->postJson('/api/property-visits/bulk-assign', ['ids' => [$visite->id], 'agent_id' => $this->agentX->id])
            ->assertOk()->assertJsonPath('data.0.ok', true);
    }

    public function test_ac6_prendre_en_charge_une_visite_confirmee(): void
    {
        $visite = $this->visite($this->a, 10, 0, ['status' => VisitStatus::Confirmed, 'agent_id' => null]);

        Sanctum::actingAs($this->agentX);
        $this->assertRefus($this->postJson("/api/property-visits/{$visite->id}/claim"));
        $this->assertNull($visite->fresh()->agent_id);

        $visite->update(['status' => VisitStatus::Scheduled]);
        $this->postJson("/api/property-visits/{$visite->id}/claim")->assertOk();
        $this->assertSame($this->agentX->id, $visite->fresh()->agent_id);
    }

    public function test_ac7_les_bornes_de_l_intervalle_semi_ouvert(): void
    {
        // Fin égale au début de la suivante : acceptée avant (09:30 + 30 min) comme après (10:30).
        $this->accepteeEtLiberee($this->visite($this->a, 9, 30, ['duration_minutes' => 30]));
        $this->accepteeEtLiberee($this->visite($this->a, 10, 30));

        // Une minute de chevauchement : refusée, d'un côté comme de l'autre.
        $this->assertRefus($this->confirmer($this->visite($this->a, 10, 29)));
        $this->assertRefus($this->confirmer($this->visite($this->a, 9, 31, ['duration_minutes' => 30])));
        // Une durée absente compte pour 30 minutes, côté demande : 09:31 sans durée chevauche 10:00.
        $this->assertRefus($this->confirmer($this->visite($this->a, 9, 31)));
        $this->accepteeEtLiberee($this->visite($this->a, 9, 31, ['duration_minutes' => 29]));
    }

    /** Confirmée (200), puis annulée : elle ne gêne pas le cas suivant. */
    private function accepteeEtLiberee(PropertyVisit $demande): void
    {
        $this->confirmer($demande)->assertOk();
        $demande->update(['status' => VisitStatus::Cancelled]);
    }

    public function test_ac7_une_occupation_sans_duree_occupe_trente_minutes(): void
    {
        $this->occupation->update(['duration_minutes' => null]);

        $this->assertRefus($this->confirmer($this->visite($this->a, 10, 29)));
        $this->confirmer($this->visite($this->a, 10, 30))->assertOk();
    }

    public function test_ac8_ce_qui_n_occupe_pas_l_agent(): void
    {
        $etats = [
            'annulée' => ['status' => VisitStatus::Cancelled],
            'en attente' => ['status' => VisitStatus::Scheduled],
            'terminée' => ['status' => VisitStatus::Completed],
            'absent' => ['status' => VisitStatus::NoShow],
            'à tranche' => ['status' => VisitStatus::Confirmed, 'preferred_window' => VisitWindow::Morning],
        ];
        foreach ($etats as $nom => $etat) {
            $this->occupation->update($etat);
            $demande = $this->visite($this->a, 10);
            $this->assertSame(200, $this->confirmer($demande)->status(), "occupation {$nom}");
            // Libère le bien A pour l'état suivant.
            $demande->update(['status' => VisitStatus::Cancelled]);
        }

        // Une visite sans agent n'est jamais refusée pour ce motif.
        $this->occupation->update(['status' => VisitStatus::Confirmed, 'preferred_window' => null]);
        $this->confirmer($this->visite($this->a, 10, 0, ['agent_id' => null]))->assertOk();
    }

    /**
     * AC9 — la grille de X sur A et le refus disent la même chose, créneau par créneau, sur toute la
     * matinée : une heure libre n'est jamais refusée pour ce motif, une heure prise toujours.
     */
    public function test_ac9_parite_avec_la_grille_de_l_agent(): void
    {
        Sanctum::actingAs($this->admin);
        $jour = $this->h(10)->setTimezone(VisitSchedulingService::TIMEZONE)->format('Y-m-d');
        $grille = collect($this->getJson("/api/property-visits/slots?property_id={$this->a->id}&date={$jour}&agent_id={$this->agentX->id}")
            ->assertOk()->json('data.slots'))->keyBy('label');

        $this->assertFalse($grille['10:00']['available']);
        $this->assertTrue($grille['10:30']['available']);

        foreach (['09:00', '09:30', '10:00', '10:30', '11:00'] as $label) {
            [$heure, $minute] = array_map('intval', explode(':', $label));
            $demande = $this->visite($this->a, $heure, $minute);
            $reponse = $this->confirmer($demande);
            if ($grille[$label]['available']) {
                $this->assertSame(200, $reponse->status(), "{$label} libre sur la grille");
                $demande->update(['status' => VisitStatus::Cancelled]);
            } else {
                $this->assertRefus($reponse);
            }
        }
    }

    public function test_ac10_bien_et_agent_pris_c_est_le_bien_qui_parle(): void
    {
        $this->occupation->update(['property_id' => $this->a->id]);

        $this->assertRefus($this->confirmer($this->visite($this->a, 10)), 'visit.slot_overlap');
    }

    public function test_ac11_une_visite_dans_une_autre_agence_occupe_l_agent_sans_rien_reveler(): void
    {
        $y = $this->agence();
        AgentProfile::factory()->create(['user_id' => $this->agentX->id, 'agency_id' => $y->id]);
        $this->occupation->update(['property_id' => $this->bienDe($y)->id]);

        $reponse = $this->confirmer($this->visite($this->a, 10));
        $this->assertRefus($reponse);
        $this->assertSame(['code', 'message'], array_keys($reponse->json()));
        $this->assertStringNotContainsString((string) $this->occupation->id, $reponse->getContent());
    }

    public function test_ac12_la_ligne_de_l_agent_est_verrouillee_avant_la_lecture_de_ses_visites(): void
    {
        $demande = $this->visite($this->a, 11);
        $requetes = [];
        DB::listen(function ($q) use (&$requetes): void {
            $requetes[] = ['sql' => $q->sql, 'bindings' => $q->bindings];
        });

        $this->confirmer($demande)->assertOk();

        $verrou = collect($requetes)->search(fn (array $q) => preg_match('/from "users" where "users"\."id" = \? .*for update/', $q['sql']) === 1
            && in_array($this->agentX->id, $q['bindings'], true));
        $lecture = collect($requetes)->search(fn (array $q) => str_contains($q['sql'], 'from "property_visits" where "agent_id" = ?'));
        $this->assertNotFalse($verrou, 'la ligne de l’agent est verrouillée');
        $this->assertNotFalse($lecture, 'les visites de l’agent sont lues');
        $this->assertLessThan($lecture, $verrou);
    }

    /**
     * Une visite confirmée encore à tranche (sans heure fixée) n'occupe personne : l'attribuer passe ;
     * lui fixer une heure où l'agent est pris est refusé.
     */
    public function test_une_visite_confirmee_a_tranche_n_occupe_l_agent_qu_une_fois_son_heure_fixee(): void
    {
        $agentY = $this->personnel($this->x);
        // Son heure de référence tombe sur l'agent pris (10:00), mais elle n'est pas fixée.
        $tranche = $this->visite($this->a, 10, 0, ['status' => VisitStatus::Confirmed, 'preferred_window' => VisitWindow::Morning, 'agent_id' => $agentY->id]);
        $this->assertSame(VisitWindow::Morning, $tranche->fresh()->preferred_window);

        Sanctum::actingAs($this->admin);
        $this->postJson('/api/property-visits/bulk-assign', ['ids' => [$tranche->id], 'agent_id' => $this->agentX->id])
            ->assertOk()->assertJsonPath('data.0.ok', true);
        $tranche->update(['agent_id' => $agentY->id]);
        $this->patchJson("/api/property-visits/{$tranche->id}", ['agent_id' => $this->agentX->id])->assertOk();

        // Fixer l'heure à 10:00 sur l'agent pris : refusé.
        $this->assertRefus($this->patchJson("/api/property-visits/{$tranche->id}", ['scheduled_at' => $this->h(10)->toIso8601String()]));
        $this->assertSame(VisitWindow::Morning, $tranche->fresh()->preferred_window);
    }

    /**
     * L'attribution et la modification verrouillent la ligne de la VISITE avant celle de l'agent :
     * l'ordre de `confirmOrFail` (la visite, puis l'agent). L'ordre inverse croisait une confirmation
     * concurrente (interblocage), et le statut se jugeait sur la visite lue avant la transaction.
     */
    public function test_prendre_en_charge_et_modifier_verrouillent_la_visite_avant_l_agent(): void
    {
        $agentY = $this->personnel($this->x);
        $gestes = [
            'prendre en charge' => [$this->agentX, fn (PropertyVisit $v) => $this->postJson("/api/property-visits/{$v->id}/claim"), ['agent_id' => null]],
            'modifier' => [$this->admin, fn (PropertyVisit $v) => $this->patchJson("/api/property-visits/{$v->id}", ['agent_id' => $this->agentX->id]), ['agent_id' => $agentY->id]],
        ];
        foreach ($gestes as $nom => [$qui, $geste, $attributs]) {
            $visite = $this->visite($this->a, 11, 0, ['status' => VisitStatus::Confirmed] + $attributs);
            Sanctum::actingAs($qui);
            $requetes = [];
            DB::listen(function ($q) use (&$requetes): void {
                $requetes[] = $q->sql;
            });

            $this->assertSame(200, $geste($visite)->status(), $nom);

            $visiteVerrouillee = collect($requetes)->search(fn (string $sql) => preg_match('/from "property_visits" where "property_visits"\."id" = \? .*for update/', $sql) === 1);
            $agentVerrouille = collect($requetes)->search(fn (string $sql) => preg_match('/from "users" where "users"\."id" = \? .*for update/', $sql) === 1);
            $this->assertNotFalse($visiteVerrouillee, "{$nom} : la ligne de la visite est verrouillée");
            $this->assertNotFalse($agentVerrouille, "{$nom} : la ligne de l’agent est verrouillée");
            $this->assertLessThan($agentVerrouille, $visiteVerrouillee, $nom);
            $visite->update(['status' => VisitStatus::Cancelled]);
        }
    }

    /**
     * TCK-2744 (d1, verif-commercial) — UN ordre de verrous pour tous les écrivains d'une visite : le
     * BIEN, puis la VISITE, puis l'AGENT ({@see VisitSchedulingService::verrouillerBienPuisVisite()}).
     * La visite verrouillée avant le bien, puis les autres visites confirmées du bien, faisaient
     * s'interbloquer deux `update` simultanés sur deux visites d'un même bien (40P01, 19 fois sur 20,
     * course à deux processus du vérificateur ; 20 sur 20 passent bien d'abord). La course ne tient
     * pas dans `RefreshDatabase` (une connexion) : l'ordre est épinglé ici, chemin par chemin, par les
     * premiers `FOR UPDATE` de chaque table, et aucune autre visite que la sienne n'est verrouillée.
     */
    public function test_chaque_ecrivain_verrouille_le_bien_puis_la_visite_puis_l_agent(): void
    {
        $agentY = $this->personnel($this->x);
        $confirmee = fn (array $attributs = []) => $this->visite($this->a, 11, 0, ['status' => VisitStatus::Confirmed] + $attributs);
        $chemins = [
            'confirmer' => [fn () => $this->visite($this->a, 11), fn (PropertyVisit $v) => $this->confirmer($v), ['properties', 'property_visits', 'users']],
            'confirmer en lot' => [fn () => $this->visite($this->a, 11), function (PropertyVisit $v) {
                Sanctum::actingAs($this->admin);

                return $this->postJson('/api/property-visits/bulk-confirm', ['visits' => [['id' => $v->id]]])->assertJsonPath('data.0.ok', true);
            }, ['properties', 'property_visits', 'users']],
            'modifier la durée' => [$confirmee, function (PropertyVisit $v) {
                Sanctum::actingAs($this->admin);

                return $this->patchJson("/api/property-visits/{$v->id}", ['duration_minutes' => 45]);
            }, ['properties', 'property_visits', 'users']],
            'modifier l’agent' => [fn () => $confirmee(['agent_id' => $agentY->id]), function (PropertyVisit $v) {
                Sanctum::actingAs($this->admin);

                return $this->patchJson("/api/property-visits/{$v->id}", ['agent_id' => $this->agentX->id]);
            }, ['properties', 'property_visits', 'users']],
            'prendre en charge' => [fn () => $confirmee(['agent_id' => null]), function (PropertyVisit $v) {
                Sanctum::actingAs($this->agentX);

                return $this->postJson("/api/property-visits/{$v->id}/claim");
            }, ['properties', 'property_visits', 'users']],
            'attribuer en lot' => [fn () => $confirmee(['agent_id' => $agentY->id]), function (PropertyVisit $v) {
                Sanctum::actingAs($this->admin);

                return $this->postJson('/api/property-visits/bulk-assign', ['ids' => [$v->id], 'agent_id' => $this->agentX->id])->assertJsonPath('data.0.ok', true);
            }, ['properties', 'property_visits', 'users']],
            'proposer un autre créneau' => [$confirmee, function (PropertyVisit $v) {
                app(VisitSchedulingService::class)->rescheduleOrFail($v, $this->h(14));

                return null;
            }, ['properties', 'property_visits']],
            'planifier confirmée' => [fn () => null, function () {
                Sanctum::actingAs($this->admin);

                return $this->postJson('/api/property-visits', [
                    'property_id' => $this->a->id, 'agent_id' => $this->agentX->id, 'scheduled_at' => $this->h(11)->toIso8601String(),
                    'visitor_name' => 'Awa Diop', 'visitor_phone' => '+221771234567',
                ]);
            }, ['properties', 'users']],
        ];

        foreach ($chemins as $nom => [$decor, $geste, $attendu]) {
            $visite = $decor();
            $verrous = [];
            DB::listen(function ($q) use (&$verrous): void {
                if (preg_match('/from "(properties|property_visits|users)" where (.*) for update/', $q->sql, $m) === 1) {
                    $verrous[] = ['table' => $m[1], 'where' => $m[2], 'bindings' => $q->bindings];
                }
            });

            $reponse = $geste($visite);
            if ($reponse !== null) {
                $this->assertContains($reponse->status(), [200, 201], "{$nom} : ".$reponse->getContent());
            }

            $premiers = [];
            foreach ($verrous as $i => $verrou) {
                $premiers[$verrou['table']] ??= $i;
            }
            $this->assertSame($attendu, array_keys($premiers), "{$nom} : l’ordre des premiers verrous");

            foreach ($verrous as $verrou) {
                if ($verrou['table'] === 'properties') {
                    $this->assertSame([$this->a->id], $verrou['bindings'], "{$nom} : seul le bien de la visite");
                }
                if ($verrou['table'] === 'property_visits') {
                    $this->assertStringStartsWith('"property_visits"."id" = ?', $verrou['where'], "{$nom} : aucune autre visite du bien n’est verrouillée");
                    $this->assertSame([$visite->id], $verrou['bindings'], $nom);
                }
            }

            PropertyVisit::query()->where('property_id', $this->a->id)->update(['status' => VisitStatus::Cancelled]);
        }
    }
}
