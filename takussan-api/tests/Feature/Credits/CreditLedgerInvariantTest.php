<?php

namespace Tests\Feature\Credits;

use App\Models\Agency;
use App\Models\CreditLot;
use App\Models\CreditMovement;
use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Enums\CreditMovementType;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Models\User;
use App\Services\Credits\CreditLedger;
use App\Services\Credits\InsufficientCredits;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use LogicException;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §2) — l'invariant du registre, vérifiable ligne à ligne :
 *   · chaque lot a EXACTEMENT un mouvement positif, égal à son montant initial ;
 *   · montant initial + somme de ses mouvements négatifs = restant.
 * Et le solde est la somme des restants des lots non expirés.
 */
class CreditLedgerInvariantTest extends TestCase
{
    use RefreshDatabase;

    private CreditLedger $ledger;

    protected function setUp(): void
    {
        parent::setUp();
        $this->ledger = app(CreditLedger::class);
    }

    public function test_un_parcours_complet_tient_l_invariant(): void
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->create();

        $this->ledger->grant($agency, CreditLotOrigin::Welcome, 500, now()->addDays(180));
        $this->ledger->grant($agency, CreditLotOrigin::AdminGrant, 40, now()->addDays(2), $admin, 'Geste commercial');
        // 120 : les 40 de l'octroi (expiration la plus proche) puis 80 de la bienvenue → 420.
        $this->ledger->spend($agency, 120);
        // 30 : bienvenue → 390.
        $this->ledger->spend($agency, 30, CreditMovementType::AdminDebit, null, $admin, 'Correction');
        $this->ledger->grant($agency, CreditLotOrigin::AdminGrant, 25, now()->addDay(), $admin, 'Essai');

        $this->travel(3)->days();
        // Le lot de 25, intact, expire ; celui de 40, déjà vide, n'a rien à expirer.
        $this->assertSame(1, $this->ledger->expireDue());

        $boost = $this->boost($agency);
        // 20 : bienvenue → 370 ; puis 12 remboursés dans un lot `refund`.
        $this->ledger->spend($agency, 20, CreditMovementType::Spend, $boost);
        $this->ledger->refund($boost, 12);

        $this->assertSame([], $this->ledger->invariantViolations());
        $this->assertSame(382, $this->ledger->balance($agency));

        foreach (CreditLot::query()->where('agency_id', $agency->id)->get() as $lot) {
            $positifs = CreditMovement::query()->where('credit_lot_id', $lot->id)->where('amount', '>', 0)->get();
            $this->assertCount(1, $positifs, "lot {$lot->id}");
            $this->assertSame($lot->initial_amount, $positifs->first()->amount);
        }
    }

    public function test_le_controle_voit_un_restant_falsifie(): void
    {
        $agency = Agency::factory()->create();
        $lot = $this->ledger->grant($agency, CreditLotOrigin::Welcome, 100, now()->addDays(10));

        DB::table('credit_lots')->where('id', $lot->id)->update(['remaining_amount' => 99]);

        $this->assertSame([$lot->id], $this->ledger->invariantViolations());
    }

    public function test_un_lot_expire_ne_compte_plus_et_se_solde_par_un_mouvement(): void
    {
        $agency = Agency::factory()->create();
        $lot = $this->ledger->grant($agency, CreditLotOrigin::Welcome, 100, now()->addDay());

        $this->travel(2)->days();

        $this->assertSame(0, $this->ledger->balance($agency));
        $this->assertSame(1, $this->ledger->expireDue());
        $this->assertSame(0, $this->ledger->expireDue(), 'expirer deux fois ne crée pas deux mouvements');
        $this->assertSame(0, $lot->fresh()->remaining_amount);
        $this->assertSame(-100, (int) CreditMovement::query()->where('credit_lot_id', $lot->id)->where('type', CreditMovementType::Expire)->value('amount'));
        $this->assertSame([], $this->ledger->invariantViolations());
    }

    public function test_un_solde_insuffisant_n_ecrit_rien(): void
    {
        $agency = Agency::factory()->create();
        $this->ledger->grant($agency, CreditLotOrigin::Welcome, 10, now()->addDays(10));
        $avant = CreditMovement::query()->count();

        try {
            $this->ledger->spend($agency, 11);
            $this->fail('dépense au-delà du solde acceptée');
        } catch (InsufficientCredits $e) {
            $this->assertSame(1, $e->missing());
            $this->assertSame(10, $e->balance);
        }

        $this->assertSame($avant, CreditMovement::query()->count());
        $this->assertSame(10, $this->ledger->balance($agency));
    }

    public function test_un_montant_nul_ou_negatif_est_refuse(): void
    {
        $agency = Agency::factory()->create();

        $this->expectException(InvalidArgumentException::class);
        $this->ledger->grant($agency, CreditLotOrigin::Welcome, 0, null);
    }

    public function test_l_achat_de_credits_reste_la_phase_2(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->ledger->grant(Agency::factory()->create(), CreditLotOrigin::Purchase, 10, null);
    }

    public function test_un_mouvement_ne_se_modifie_pas_par_le_modele(): void
    {
        $agency = Agency::factory()->create();
        $lot = $this->ledger->grant($agency, CreditLotOrigin::Welcome, 10, null);
        $mouvement = CreditMovement::query()->where('credit_lot_id', $lot->id)->firstOrFail();

        $this->expectException(LogicException::class);
        $mouvement->update(['reason' => 'réécrit']);
    }

    /**
     * ADR-0061 §4 — le remboursement se répartit PAR LOT D'ORIGINE, au prorata de ce que chaque lot
     * a fourni au boost, et chaque part hérite de l'expiration de SON lot : la part d'un crédit
     * offert garde sa date, la part d'un crédit acheté reste sans expiration.
     */
    public function test_le_remboursement_se_repartit_par_lot_d_origine_et_herite_de_son_expiration(): void
    {
        $agency = Agency::factory()->create();
        $offert = $this->ledger->grant($agency, CreditLotOrigin::Welcome, 10, now()->addDays(5));
        $achete = $this->lotAchete($agency, 10);
        $boost = $this->boost($agency);
        // Ordre de consommation : l'offert (qui expire) puis l'acheté — 10 + 10.
        $this->ledger->spend($agency, 20, CreditMovementType::Spend, $boost);

        $issue = $this->ledger->refund($boost, 10);

        $this->assertSame(10, $issue->refunded);
        $this->assertSame(0, $issue->expired);
        $parts = CreditLot::query()->where('agency_id', $agency->id)->where('origin', CreditLotOrigin::Refund)->orderBy('id')->get();
        $this->assertCount(2, $parts, 'une part par lot d’origine');
        $this->assertSame([5, 5], $parts->pluck('initial_amount')->all());
        $this->assertTrue($parts[0]->expires_at->equalTo($offert->fresh()->expires_at), 'la part de l’offert garde SA date, sans prolongation');
        $this->assertNull($parts[1]->expires_at, 'la part de l’acheté n’expire jamais');
        $this->assertNotNull($achete);
        $this->assertSame(10, $this->ledger->balance($agency));
        $this->assertSame([], $this->ledger->invariantViolations());
    }

    /** Une part dont le lot d'origine a déjà expiré n'est pas rendue : rien ne ressuscite. */
    public function test_une_part_dont_l_expiration_est_passee_n_est_pas_rendue(): void
    {
        $agency = Agency::factory()->create();
        $this->ledger->grant($agency, CreditLotOrigin::Welcome, 10, now()->addDays(2));
        $this->lotAchete($agency, 10);
        $boost = $this->boost($agency);
        $this->ledger->spend($agency, 20, CreditMovementType::Spend, $boost);
        $this->travel(3)->days();

        $issue = $this->ledger->refund($boost, 10);

        $this->assertSame(5, $issue->refunded);
        $this->assertSame(5, $issue->expired);
        $parts = CreditLot::query()->where('agency_id', $agency->id)->where('origin', CreditLotOrigin::Refund)->get();
        $this->assertCount(1, $parts, 'aucun lot né expiré');
        $this->assertSame(5, $parts->sole()->initial_amount);
        $this->assertNull($parts->sole()->expires_at);
        $this->assertSame(5, $this->ledger->balance($agency));

        // Tout expiré : rien n'est rendu, aucun lot n'est écrit.
        $agency2 = Agency::factory()->create();
        $this->ledger->grant($agency2, CreditLotOrigin::Welcome, 10, now()->addDay());
        $boost2 = $this->boost($agency2);
        $this->ledger->spend($agency2, 10, CreditMovementType::Spend, $boost2);
        $this->travel(2)->days();

        $rien = $this->ledger->refund($boost2, 8);
        $this->assertSame(0, $rien->refunded);
        $this->assertSame(8, $rien->expired);
        $this->assertSame(0, CreditLot::query()->where('agency_id', $agency2->id)->where('origin', CreditLotOrigin::Refund)->count());
        $this->assertSame([], $this->ledger->invariantViolations());
    }

    /** L'arrondi : la somme des parts ne dépasse ni le prorata demandé, ni ce que chaque lot a payé. */
    public function test_la_somme_des_parts_ne_depasse_ni_le_prorata_ni_le_paye(): void
    {
        $agency = Agency::factory()->create();
        $lots = [
            $this->ledger->grant($agency, CreditLotOrigin::AdminGrant, 1, now()->addDays(3)),
            $this->ledger->grant($agency, CreditLotOrigin::AdminGrant, 1, now()->addDays(4)),
            $this->ledger->grant($agency, CreditLotOrigin::AdminGrant, 1, now()->addDays(5)),
        ];
        $boost = $this->boost($agency);
        $this->ledger->spend($agency, 3, CreditMovementType::Spend, $boost);

        $issue = $this->ledger->refund($boost, 2);
        $this->assertSame(2, $issue->refunded, 'le prorata est rendu en entier, sans crédit perdu à l’arrondi');
        $parts = CreditLot::query()->where('agency_id', $agency->id)->where('origin', CreditLotOrigin::Refund)->get();
        $this->assertSame(2, (int) $parts->sum('initial_amount'));
        $this->assertTrue($parts->every(fn (CreditLot $p) => $p->initial_amount <= 1), 'aucune part ne dépasse son lot');
        $this->assertCount(3, $lots);

        // Un prorata demandé au-delà du payé est borné au payé.
        $agency2 = Agency::factory()->create();
        $this->ledger->grant($agency2, CreditLotOrigin::Welcome, 4, now()->addDays(10));
        $this->ledger->grant($agency2, CreditLotOrigin::Welcome, 3, now()->addDays(20));
        $boost2 = $this->boost($agency2);
        $this->ledger->spend($agency2, 7, CreditMovementType::Spend, $boost2);

        $borne = $this->ledger->refund($boost2, 50);
        $this->assertSame(7, $borne->refunded);
        $this->assertSame(7, (int) CreditLot::query()->where('agency_id', $agency2->id)->where('origin', CreditLotOrigin::Refund)->sum('initial_amount'));
        $this->assertSame([], $this->ledger->invariantViolations());
    }

    /** Un boost qui n'a rien payé (offert) n'a rien à rendre, quel que soit le prorata demandé. */
    public function test_un_boost_qui_n_a_rien_paye_ne_rend_rien(): void
    {
        $agency = Agency::factory()->create();

        $issue = $this->ledger->refund($this->boost($agency), 5);

        $this->assertSame(0, $issue->refunded);
        $this->assertSame(0, CreditLot::query()->where('agency_id', $agency->id)->count());
    }

    /** Un lot `purchase` (phase 2) : `grant()` le refuse, il s'écrit donc en brut — lot et mouvement. */
    private function lotAchete(Agency $agency, int $amount): CreditLot
    {
        $id = DB::table('credit_lots')->insertGetId([
            'agency_id' => $agency->id, 'origin' => CreditLotOrigin::Purchase->value, 'initial_amount' => $amount,
            'remaining_amount' => $amount, 'created_at' => now(), 'updated_at' => now(),
        ]);
        CreditMovement::record(['agency_id' => $agency->id, 'credit_lot_id' => $id, 'type' => CreditMovementType::Grant, 'amount' => $amount]);

        return CreditLot::query()->findOrFail($id);
    }

    private function boost(Agency $agency): PropertyBoost
    {
        $property = Property::factory()->published()->create(['agency_id' => $agency->id]);

        return PropertyBoost::query()->create([
            'property_id' => $property->id, 'agency_id' => $agency->id, 'kind' => BoostKind::Featured,
            'price_credits' => 20, 'duration_days' => 7, 'starts_at' => now(), 'ends_at' => now()->addDays(7),
            'status' => BoostStatus::Active,
        ]);
    }
}
