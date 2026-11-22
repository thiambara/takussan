<?php

namespace Tests\Unit\Notifications;

use App\Domain\Notifications\NotificationClassification;
use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationFamily;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Enums\NotificationType;
use PHPUnit\Framework\TestCase;

/**
 * TCK-2633 — garde de recensement de la table des familles (`NotificationClassification`), comme
 * la parité des langues : un `NotificationCode`, un genre de cible (`NotificationTarget::PATHS`) ou
 * un `NotificationType` neuf sans ligne fait échouer ce test, en le nommant. Une ligne qui ne vise
 * plus aucun cas (code renommé) aussi.
 */
class NotificationFamilyTableTest extends TestCase
{
    public function test_chaque_code_du_catalogue_a_sa_famille_et_son_a_traiter(): void
    {
        $manquants = array_values(array_filter(
            array_map(static fn (NotificationCode $c): string => $c->value, NotificationCode::cases()),
            static fn (string $code): bool => ! array_key_exists($code, NotificationClassification::CODES),
        ));

        $this->assertSame([], $manquants, 'Codes sans famille dans NotificationClassification::CODES : '.implode(', ', $manquants));
    }

    public function test_chaque_type_a_sa_famille_pour_les_lignes_sans_code(): void
    {
        $manquants = array_values(array_filter(
            array_map(static fn (NotificationType $t): string => $t->value, NotificationType::cases()),
            static fn (string $type): bool => ! array_key_exists($type, NotificationClassification::TYPES),
        ));

        $this->assertSame([], $manquants, 'Types sans famille dans NotificationClassification::TYPES : '.implode(', ', $manquants));
    }

    public function test_chaque_genre_de_cible_a_sa_ligne_pour_les_lignes_sans_code(): void
    {
        $manquants = array_values(array_diff(array_keys(NotificationTarget::PATHS), array_keys(NotificationClassification::TARGETS)));
        $orphelins = array_values(array_diff(array_keys(NotificationClassification::TARGETS), array_keys(NotificationTarget::PATHS)));

        $this->assertSame([], $manquants, 'Genres de cible sans ligne dans NotificationClassification::TARGETS : '.implode(', ', $manquants));
        $this->assertSame([], $orphelins, 'lignes de genre de cible orphelines : '.implode(', ', $orphelins));
        foreach (NotificationClassification::TARGETS as $kind => $famille) {
            $this->assertTrue($famille === null || NotificationFamily::tryFrom($famille) !== null, "{$kind} : famille inconnue « {$famille} »");
        }
    }

    public function test_la_table_ne_porte_que_des_cas_existants_et_des_familles_connues(): void
    {
        $codes = array_map(static fn (NotificationCode $c): string => $c->value, NotificationCode::cases());
        $types = array_map(static fn (NotificationType $t): string => $t->value, NotificationType::cases());

        $this->assertSame([], array_values(array_diff(array_keys(NotificationClassification::CODES), $codes)), 'lignes de code orphelines');
        $this->assertSame([], array_values(array_diff(array_keys(NotificationClassification::TYPES), $types)), 'lignes de type orphelines');

        foreach (NotificationClassification::CODES as $code => [$famille, $aTraiter]) {
            $this->assertNotNull(NotificationFamily::tryFrom($famille), "{$code} : famille inconnue « {$famille} »");
            $this->assertIsBool($aTraiter, "{$code} : « à traiter » n'est pas un booléen");
        }
        foreach (NotificationClassification::TYPES as $type => $famille) {
            $this->assertNotNull(NotificationFamily::tryFrom($famille), "{$type} : famille inconnue « {$famille} »");
        }
    }

    /** Les exemples du ticket, des deux côtés de « à traiter ». */
    public function test_les_exemples_du_ticket(): void
    {
        $attendus = [
            'visit.requested' => ['visite', true],
            'lead.received' => ['demande', true],
            'booking.created' => ['demande', true],
            'property.submitted_for_review' => ['bien', true],
            'maintenance_quote.submitted' => ['demande', true],
            'review.to_moderate' => ['avis', true],
            'lease_payment.overdue_digest' => ['retard', true],
            'lease_payment.received_landlord' => ['paiement', false],
            'lease.signature_completed' => ['systeme', false],
        ];

        foreach ($attendus as $code => [$famille, $aTraiter]) {
            $classe = NotificationClassification::of($code, null, null);
            $this->assertSame([$famille, $aTraiter], [$classe['famille']->value, $classe['a_traiter']], $code);
        }
    }

    public function test_une_ligne_sans_code_prend_la_famille_de_son_type_et_n_est_jamais_a_traiter(): void
    {
        $this->assertSame(['paiement', false], $this->classe(null, NotificationType::Payment));
        $this->assertSame(['visite', false], $this->classe(null, 'visit'));
        // Un code hors catalogue se lit comme l'absence de code.
        $this->assertSame(['demande', false], $this->classe('code.disparu', 'booking'));
        // Rien de connu : `systeme`, jamais une erreur.
        $this->assertSame(['systeme', false], $this->classe(null, 'type_disparu'));
        $this->assertSame(['systeme', false], $this->classe(null, null));
    }

    /** Décision du 2026-11-11 : sans code, la cible stockée range avant le type. */
    public function test_une_ligne_sans_code_est_rangee_par_sa_cible_avant_son_type(): void
    {
        // « Mise en avant terminée » : `system`, cible `property`.
        $this->assertSame(['bien', false], $this->classe(null, NotificationType::System, 'property'));
        $this->assertSame(['systeme', false], $this->classe(null, NotificationType::System, 'credits'));
        // Un genre qui ne tranche pas (`lease` : bail ou échéance) laisse le type décider.
        $this->assertSame(['paiement', false], $this->classe(null, NotificationType::Payment, 'lease'));
        // Un genre inconnu se lit comme l'absence de cible.
        $this->assertSame(['demande', false], $this->classe(null, NotificationType::Booking, 'genre_disparu'));
        // Le code passe avant la cible.
        $this->assertSame(['visite', true], $this->classe('visit.requested', NotificationType::Visit, 'property'));
    }

    /** @return array{0: string, 1: bool} */
    private function classe(?string $code, NotificationType|string|null $type, ?string $targetKind = null): array
    {
        $classe = NotificationClassification::of($code, $type, $targetKind);

        return [$classe['famille']->value, $classe['a_traiter']];
    }
}
