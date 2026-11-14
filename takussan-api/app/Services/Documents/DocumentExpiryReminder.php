<?php

namespace App\Services\Documents;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Agency;
use App\Models\Document;
use App\Models\Inventory;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use App\Services\Model\NotificationService;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

/**
 * TCK-2783 — une pièce datée (`documents.expiry_date`) arrive à échéance : son destinataire est
 * prévenu à J-60 puis à J-7, comptés au jour de Dakar (`Document::today()`), comme la marque
 * « expire dans N jours » du coffre. Sur le modèle de `KycExpiryService`.
 *
 *  · **Une fois par jalon et par date visée.** Les jalons envoyés se mémorisent dans
 *    `metadata.expiry_reminders`, AVEC la date d'expiration qu'ils visaient
 *    (`{expiry_date, sent}`) : une nouvelle date (pièce remplacée, date corrigée) réarme les jalons.
 *  · **Rattrapage sans doublon.** Le jalon le plus proche atteint part ; les plus lointains, déjà
 *    franchis, sont marqués envoyés sans notifier. Une pièce saisie à J-5 ne reçoit que le J-7.
 *  · **Destinataire** ({@see self::destinataire()}) : le compte qui porte la pièce (« Mes pièces »),
 *    sinon son téléverseur — et l'un comme l'autre seulement s'il la LIT encore (`DocumentPolicy::view`,
 *    le personnel jugé sur l'agence du document) : le membre du personnel parti n'est pas prévenu, et un
 *    document interne (ADR-0099) ne va qu'au personnel actif de sa fiche, jamais à son sujet.
 *  · Ni pièce expirée (avant aujourd'hui, à Dakar), ni pièce supprimée (corbeille), ni pièce sans date.
 *  · Le jalon ne se pose qu'après un avis REÇU (`send()` non nul), comme le KYC (TCK-2073) : sans
 *    destinataire, il reste libre, et part au passage suivant si quelqu'un peut de nouveau la lire.
 */
class DocumentExpiryReminder
{
    /** Jalons de rappel, en jours avant l'échéance, du plus lointain au plus proche. */
    public const REMINDER_DAYS = [60, 7];

    public function __construct(private readonly NotificationService $notifications) {}

    /** @return array{reminded: int} */
    public function run(): array
    {
        $today = Document::today();
        $reminded = 0;

        Document::query()
            ->whereNotNull('expiry_date')
            ->whereBetween('expiry_date', [$today->toDateString(), $today->addDays(max(self::REMINDER_DAYS))->toDateString()])
            ->with(['documentable', 'uploader'])
            ->orderBy('id')
            ->each(function (Document $document) use ($today, &$reminded): void {
                if ($this->remind($document, $today)) {
                    $reminded++;
                }
            });

        return ['reminded' => $reminded];
    }

    /**
     * Le compte que le rappel de cette pièce vise, ou `null` : le porteur `User` (« Mes pièces »),
     * sinon le téléverseur ; celui-là seulement s'il lit encore la pièce.
     *
     * Le personnel se juge sur l'agence DU DOCUMENT (décision de la session du 2026-11-14) : hors
     * requête, il n'y a pas de profil actif de session, et `DocumentPolicy` (`isStaffOf`, par
     * `staffAgencyId()`) ne reconnaissait pas le membre du personnel de DEUX agences. Le jugement se
     * fait donc sous le profil de personnel ACTIF du destinataire dans l'agence du document, s'il en a
     * un ; la policy reste le seul juge, et compare toujours cette agence à celle du document.
     */
    public static function destinataire(Document $document): ?User
    {
        $candidat = $document->documentable_type === User::class
            ? $document->documentable
            : $document->uploader;

        if (! $candidat instanceof User) {
            return null;
        }

        $profil = self::profilDePersonnelDansLAgence($candidat, self::agenceDuDocument($document));
        $attributs = request()->attributes;
        $avant = $attributs->get('active_profile');
        $avait = $attributs->has('active_profile');
        if ($profil !== null) {
            $attributs->set('active_profile', $profil);
        }

        try {
            return Gate::forUser($candidat)->allows('view', $document) ? $candidat : null;
        } finally {
            $avait ? $attributs->set('active_profile', $avant) : $attributs->remove('active_profile');
        }
    }

    /** L'agence que `DocumentPolicy` juge pour ce document : celle de son porteur (d'un état des lieux, celle du bien). */
    private static function agenceDuDocument(Document $document): ?int
    {
        $porteur = $document->documentable;
        $agence = match (true) {
            $porteur instanceof Agency => $porteur->id,
            $porteur instanceof Inventory => $porteur->property?->agency_id,
            default => $porteur?->agency_id ?? null,
        };

        return is_numeric($agence) ? (int) $agence : null;
    }

    /** Le profil d'agent ou d'administrateur ACTIF du compte dans cette agence, s'il en a un. */
    private static function profilDePersonnelDansLAgence(User $user, ?int $agencyId): AgentProfile|AgencyAdminProfile|null
    {
        if ($agencyId === null) {
            return null;
        }

        return AgencyAdminProfile::query()->where('user_id', $user->id)->where('agency_id', $agencyId)->active()->first()
            ?? AgentProfile::query()->where('user_id', $user->id)->where('agency_id', $agencyId)->active()->first();
    }

    private function remind(Document $document, CarbonImmutable $today): bool
    {
        $expiry = $document->expiry_date->toDateString();
        $daysLeft = (int) $today->diffInDays(CarbonImmutable::parse($expiry, Document::EXPIRY_TIMEZONE), false);
        if ($daysLeft < 0) {
            return false;
        }

        $metadata = $document->metadata ?? [];
        $sent = self::sentFor($metadata['expiry_reminders'] ?? null, $expiry);

        // Le jalon le plus proche atteint ; les plus lointains déjà franchis ne partent plus.
        $milestone = collect(self::REMINDER_DAYS)->filter(fn (int $days): bool => $daysLeft <= $days)->min();
        if ($milestone === null || in_array($milestone, $sent, true)) {
            return false;
        }

        $to = self::destinataire($document);
        if ($to === null) {
            return false;
        }

        $recu = $this->notifications->send(
            $to,
            NotificationCode::DocumentExpiringSoon,
            ['document_name' => (string) $document->name, 'expires_at' => $expiry, 'days_left' => $daysLeft],
            NotificationTarget::of('document', $document->id),
        );
        if ($recu === null) {
            return false;
        }

        $marques = collect(self::REMINDER_DAYS)
            ->filter(fn (int $days): bool => $days >= $milestone)
            ->merge($sent)
            ->unique()
            ->sortDesc()
            ->values()
            ->all();

        // Écrit hors d'Eloquent : ni `updated_at` touché (la pièce n'a pas changé pour son lecteur), ni
        // réindexation de la recherche pour une mémoire qu'elle ne lit pas.
        DB::table('documents')->where('id', $document->id)->update([
            'metadata' => json_encode(['expiry_reminders' => ['expiry_date' => $expiry, 'sent' => $marques]] + $metadata),
        ]);

        return true;
    }

    /**
     * Les jalons déjà envoyés POUR CETTE DATE : une mémoire d'une autre date (ou sans date) ne vaut pas.
     *
     * @return list<int>
     */
    private static function sentFor(mixed $memoire, string $expiry): array
    {
        if (! is_array($memoire) || ($memoire['expiry_date'] ?? null) !== $expiry || ! is_array($memoire['sent'] ?? null)) {
            return [];
        }

        return array_values(array_map('intval', $memoire['sent']));
    }
}
