<?php

namespace App\Services\Pont\Canaux;

use App\Services\Notifications\Sms\PhoneNumber;
use App\Services\Notifications\Sms\SmsDriverInterface;
use App\Services\Notifications\Sms\SmsResult;
use App\Services\Pont\CanalDuPont;
use App\Services\Pont\CapacitesDuCanal;
use App\Services\Pont\EtatDAccord;
use App\Services\Pont\EtatDuNumero;
use App\Services\Pont\LectureDuWebhook;
use App\Services\Pont\MessageEntrant;
use App\Services\Pont\ResultatDEnvoi;
use Illuminate\Http\Request;
use InvalidArgumentException;

/**
 * TCK-2981 (ADR-0132 § 0) — le pilote SMS du pont : SORTANT seulement, sur le pilote SMS lié (`SmsDriverInterface`, le
 * routeur des opérateurs ; `log` en test). Sans la capacité « reçoit » : son webhook générique rend 404, et il ne
 * reçoit ni accord ni opposition (ADR-0132, « Ce que ça ne règle pas » : pas de STOP par SMS). Le pont ne s'en sert
 * qu'en secours d'un accord donné sur un autre canal, et jamais après une opposition (`RelaisSortant`).
 */
final class Sms implements CanalDuPont
{
    public const NOM = 'sms';

    /** La longueur bornée d'un SMS du pont (deux segments). */
    private const TEXTE_MAX = 300;

    public function __construct(private readonly SmsDriverInterface $pilote) {}

    public function nom(): string
    {
        return self::NOM;
    }

    public function capacites(): CapacitesDuCanal
    {
        return new CapacitesDuCanal(recoit: false, gabarits: false, medias: false, accuses: true, boutons: false, fenetreHeures: null);
    }

    public function envoyerTexte(string $destinataire, string $texte, array $contexte = []): ResultatDEnvoi
    {
        try {
            $telephone = PhoneNumber::normalize($destinataire);
        } catch (InvalidArgumentException) {
            return ResultatDEnvoi::indisponible('numero_invalide');
        }
        $resultat = $this->pilote->send($telephone, mb_strimwidth($texte, 0, self::TEXTE_MAX, '…'), [
            'agency_id' => $contexte['agency_id'] ?? null,
            'event_type' => 'message_received',
        ])[$telephone] ?? null;

        return match (true) {
            $resultat === null => new ResultatDEnvoi(ResultatDEnvoi::ECHEC, forme: 'sms', motif: 'sms_no_result'),
            $resultat->isTerminalSuccess() => new ResultatDEnvoi(ResultatDEnvoi::ENVOYE, $resultat->providerMessageId, 'sms'),
            // Les heures calmes (ARTP) : le routeur le programme à leur fin ; il partira, sans identifiant encore.
            $resultat->status === SmsResult::STATUS_DEFERRED_TO_FALLBACK => new ResultatDEnvoi(ResultatDEnvoi::ENVOYE, null, 'sms', motif: (string) $resultat->failureReason),
            default => new ResultatDEnvoi(ResultatDEnvoi::ECHEC, forme: 'sms', ambigu: $resultat->ambiguous, motif: $resultat->failureReason),
        };
    }

    public function envoyerGabarit(string $destinataire, string $evenement, string $langue, array $variables, array $contexte = []): ResultatDEnvoi
    {
        return ResultatDEnvoi::indisponible('sans_gabarit');
    }

    /** Le SMS n'a pas de fenêtre : le texte part toujours. */
    public function fenetreOuverte(string $destinataire, ?int $agence = null): bool
    {
        return true;
    }

    /** Le SMS ne tient ni accord ni fenêtre : l'état se lit sur le canal qui reçoit. */
    public function etatDuNumero(string $telephone, ?int $agence = null): EtatDuNumero
    {
        return new EtatDuNumero;
    }

    public function jetonDuWebhook(): string
    {
        return '';
    }

    public function verifierWebhook(Request $request): void
    {
        abort(404);
    }

    public function lireWebhook(Request $request): LectureDuWebhook
    {
        return new LectureDuWebhook;
    }

    public function appliquerAccuses(array $accuses): int
    {
        return 0;
    }

    public function defiDAbonnement(Request $request): ?string
    {
        return null;
    }

    public function agenceDuNumero(string $numeroDEntreprise): int|false|null
    {
        return false;
    }

    public function canalDuProspect(): ?string
    {
        return null;
    }

    public function accord(string $telephone): EtatDAccord
    {
        return EtatDAccord::Inconnu;
    }

    public function opposer(string $telephone, string $source): void {}

    public function accorder(string $telephone, string $source, ?int $userId = null): void {}

    public function compteAccordePour(string $telephone): ?int
    {
        return null;
    }

    public function noterEntrant(MessageEntrant $message): void {}
}
