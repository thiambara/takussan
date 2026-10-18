<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\Enums\BoostStatus;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Models\User;
use App\Services\Boost\BoostLifecycle;
use App\Services\Boost\BoostPurchaseService;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * TCK-941 (P05.08) — la pause et la reprise d'un boost sont réclamées par `UPDATE … WHERE`, comme
 * la clôture : un passage qui a lu le boost avant qu'un autre ne le transitionne n'écrit rien.
 *
 * `reconcile()` lit les boosts vivants, puis décide. Entre les deux, un autre passage (un tick
 * qui chevauche, l'observateur du bien) peut avoir clos, mis en pause ou repris le boost. Le test
 * joue cet autre passage au moment exact où `reconcile()` hydrate le boost.
 */
class BoostTransitionClaimTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private Property $property;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo(Carbon::parse('2026-10-12 10:00:00'));
        $this->agency = Agency::factory()->create();
        $this->admin = $this->actingAsRole('agency_admin', ['agency' => $this->agency]);
        $this->property = Property::factory()->published()->create(['agency_id' => $this->agency->id]);
        app(CreditLedger::class)->grant($this->agency, CreditLotOrigin::Welcome, 500, now()->addDays(180));
    }

    private function vedette7j(): PropertyBoost
    {
        return app(BoostPurchaseService::class)->purchase(
            $this->property->fresh(),
            BoostProduct::query()->where('kind', 'featured')->where('duration_days', 7)->sole(),
            $this->admin,
        );
    }

    /** Joue `$autrePassage` une fois, sur la ligne, dès que `reconcile()` a lu le boost. */
    private function pendantLaLecture(PropertyBoost $boost, array $autrePassage): void
    {
        $fait = false;
        PropertyBoost::retrieved(function (PropertyBoost $lu) use ($boost, $autrePassage, &$fait) {
            if ($fait || $lu->getKey() !== $boost->getKey()) {
                return;
            }
            $fait = true;
            PropertyBoost::query()->whereKey($boost->getKey())->update($autrePassage);
        });
    }

    public function test_une_pause_ne_ranime_pas_un_boost_clos_entre_lecture_et_ecriture(): void
    {
        $vedette = $this->vedette7j();
        Property::withoutEvents(fn () => $this->property->update(['visibility' => PropertyVisibility::Private]));

        $this->pendantLaLecture($vedette, ['status' => BoostStatus::Ended->value, 'ended_at' => now()]);
        $touches = app(BoostLifecycle::class)->reconcile($this->property->fresh());

        $this->assertSame(BoostStatus::Ended, $vedette->fresh()->status, 'un boost clos reste clos');
        $this->assertSame(0, $touches, 'une transition perdue ne se compte pas');
    }

    public function test_une_reprise_rejouee_n_allonge_pas_un_boost_deja_repris(): void
    {
        $vedette = $this->vedette7j();
        $this->travel(2)->days();
        $this->property->update(['visibility' => PropertyVisibility::Private]);
        $this->assertSame(BoostStatus::Paused, $vedette->fresh()->status);

        // Un autre passage l'a repris il y a un jour : il lui reste 4 jours, pas 5.
        $this->travel(3)->days();
        Property::withoutEvents(fn () => $this->property->update(['visibility' => PropertyVisibility::Public]));
        $finAttendue = now()->subDay()->addDays(5);
        $this->pendantLaLecture($vedette, [
            'status' => BoostStatus::Active->value,
            'ends_at' => $finAttendue,
            'remaining_seconds' => null,
            'paused_at' => null,
        ]);

        $touches = app(BoostLifecycle::class)->reconcile($this->property->fresh());

        $vedette->refresh();
        $this->assertSame(BoostStatus::Active, $vedette->status);
        $this->assertSame($finAttendue->getTimestamp(), $vedette->ends_at->getTimestamp(), 'la reprise rejouée ne rend pas le jour déjà couru');
        $this->assertSame(0, $touches, 'une transition perdue ne se compte pas');
    }

    /**
     * Cas ABA : la ligne est toujours `active`, mais un autre passage a repoussé sa fin (reprise,
     * prolongation) après la lecture. Une pause réclamée sur le seul statut figerait la fin lue, et
     * perdrait les jours ajoutés : la réclamation porte aussi sur `ends_at` lu.
     */
    public function test_une_pause_calculee_sur_une_fin_perimee_ne_perd_pas_les_jours_ajoutes(): void
    {
        $vedette = $this->vedette7j();
        Property::withoutEvents(fn () => $this->property->update(['visibility' => PropertyVisibility::Private]));

        $this->pendantLaLecture($vedette, ['ends_at' => now()->addDays(10)]);
        $touches = app(BoostLifecycle::class)->reconcile($this->property->fresh());

        $this->assertSame(0, $touches, 'la pause calculée sur la fin périmée est perdue');
        $this->assertSame(BoostStatus::Active, $vedette->fresh()->status);

        // Le passage suivant rejoue la pause, sur la fin à jour.
        app(BoostLifecycle::class)->reconcile($this->property->fresh());
        $vedette->refresh();
        $this->assertSame(BoostStatus::Paused, $vedette->status);
        $this->assertSame(10 * 86400, $vedette->remaining_seconds, 'les trois jours ajoutés ne sont pas perdus');
    }

    /** Cas ABA, en miroir : `paused` des deux côtés, mais le reste à courir a changé après la lecture. */
    public function test_une_reprise_calculee_sur_un_reste_perime_ne_perd_pas_les_jours_ajoutes(): void
    {
        $vedette = $this->vedette7j();
        $this->property->update(['visibility' => PropertyVisibility::Private]);
        $this->assertSame(BoostStatus::Paused, $vedette->fresh()->status);
        Property::withoutEvents(fn () => $this->property->update(['visibility' => PropertyVisibility::Public]));

        $this->pendantLaLecture($vedette, ['remaining_seconds' => 10 * 86400]);
        $touches = app(BoostLifecycle::class)->reconcile($this->property->fresh());

        $this->assertSame(0, $touches, 'la reprise calculée sur le reste périmé est perdue');
        $this->assertSame(BoostStatus::Paused, $vedette->fresh()->status);

        app(BoostLifecycle::class)->reconcile($this->property->fresh());
        $vedette->refresh();
        $this->assertSame(BoostStatus::Active, $vedette->status);
        $this->assertSame(now()->addDays(10)->getTimestamp(), $vedette->ends_at->getTimestamp(), 'les trois jours ajoutés ne sont pas perdus');
    }

    /**
     * Une réclamation perdue laisse l'instance conforme à la ligne : pas d'attributs forcés et non
     * écrits qu'un appelant prendrait pour l'état du boost. `pause()` est privée : appelée par
     * réflexion, aucun chemin public ne rend l'instance.
     */
    public function test_une_reclamation_perdue_laisse_l_instance_conforme_a_la_ligne(): void
    {
        $vedette = $this->vedette7j();
        $lu = PropertyBoost::query()->findOrFail($vedette->getKey());
        PropertyBoost::query()->whereKey($vedette->getKey())->update(['status' => BoostStatus::Ended->value, 'ended_at' => now()]);

        $pause = new \ReflectionMethod(BoostLifecycle::class, 'pause');
        $reclamee = $pause->invoke(app(BoostLifecycle::class), $lu);

        $this->assertFalse($reclamee);
        $this->assertSame(BoostStatus::Ended, $lu->status);
        $this->assertNotNull($lu->ends_at, 'la fin forcée à null n\'a pas été écrite');
        $this->assertFalse($lu->isDirty(), 'l\'instance ne se croit pas modifiée');
    }
}
