<?php

namespace Tests\Support\Pont;

use App\Services\Pont\AccuseEntrant;
use App\Services\Pont\CanalDuPont;
use App\Services\Pont\CapacitesDuCanal;
use App\Services\Pont\EtatDAccord;
use App\Services\Pont\LectureDuWebhook;
use App\Services\Pont\MessageEntrant;
use App\Services\Pont\ResultatDEnvoi;
use Illuminate\Http\Request;

/**
 * TCK-2980 (ADR-0132 § 0) — un FAUX pilote, sans rien de WhatsApp : la preuve qu'un canal neuf ne demande qu'une
 * classe et une entrée de `config('messagerie.canaux')`. Son webhook : jeton d'URL {@see self::JETON}, signature
 * `X-Faux-Signature: ok`, corps `{"messages": [{de, vers, id, texte?, cite?}], "accuses": [{id, statut}]}`.
 * L'accord se tient ici, par numéro, pour CE canal.
 */
final class FauxCanal implements CanalDuPont
{
    public const NOM = 'faux';

    public const JETON = 'faux-jeton';

    public static bool $recoit = true;

    /** @var array<string, int|null> numéro d'entreprise => agence */
    public static array $numeros = [];

    /** @var array<string, EtatDAccord> */
    public static array $accords = [];

    /** @var list<string> */
    public static array $entrants = [];

    /** @var list<string> */
    public static array $accuses = [];

    // TCK-2981 — l'envoi : ce qui est parti, la fenêtre, la capacité « gabarits », et un résultat imposé par forme.

    /** @var list<array{forme: string, telephone: string, texte: ?string, gabarit: ?string, variables: list<string>, contexte: array<string, mixed>}> */
    public static array $envois = [];

    public static bool $fenetre = true;

    /** @var array<string, int> téléphone → compte accordé par le pont */
    public static array $comptes = [];

    public static bool $gabarits = false;

    public static bool $boutons = false;

    /** @var array<string, ResultatDEnvoi> forme (`text`, `template`) → résultat imposé */
    public static array $resultats = [];

    public static function remettreAZero(): void
    {
        self::$recoit = true;
        self::$numeros = [];
        self::$accords = [];
        self::$entrants = [];
        self::$accuses = [];
        self::$envois = [];
        self::$fenetre = true;
        self::$comptes = [];
        self::$gabarits = false;
        self::$boutons = false;
        self::$resultats = [];
    }

    public function envoyerTexte(string $destinataire, string $texte, array $contexte = []): ResultatDEnvoi
    {
        return $this->noterEnvoi('text', $destinataire, $texte, null, [], $contexte);
    }

    public function envoyerGabarit(string $destinataire, string $evenement, string $langue, array $variables, array $contexte = []): ResultatDEnvoi
    {
        if (! self::$gabarits) {
            return ResultatDEnvoi::indisponible('sans_gabarit');
        }

        return $this->noterEnvoi('template', $destinataire, null, $evenement, $variables, $contexte);
    }

    public function fenetreOuverte(string $destinataire, ?int $agence = null): bool
    {
        return self::$fenetre;
    }

    /** @param  list<string>  $variables  @param  array<string, mixed>  $contexte */
    private function noterEnvoi(string $forme, string $telephone, ?string $texte, ?string $gabarit, array $variables, array $contexte): ResultatDEnvoi
    {
        $resultat = self::$resultats[$forme] ?? new ResultatDEnvoi(ResultatDEnvoi::ENVOYE, 'faux.'.uniqid('', true), $forme, $gabarit);
        if ($resultat->statut !== ResultatDEnvoi::INDISPONIBLE) {
            self::$envois[] = ['forme' => $forme, 'telephone' => $telephone, 'texte' => $texte, 'gabarit' => $gabarit, 'variables' => array_values($variables), 'contexte' => $contexte];
        }

        return $resultat;
    }

    public function nom(): string
    {
        return self::NOM;
    }

    public function capacites(): CapacitesDuCanal
    {
        return new CapacitesDuCanal(recoit: self::$recoit, gabarits: self::$gabarits, medias: true, accuses: true, boutons: self::$boutons, fenetreHeures: null);
    }

    public function jetonDuWebhook(): string
    {
        return self::JETON;
    }

    public function verifierWebhook(Request $request): void
    {
        if ($request->header('X-Faux-Signature') !== 'ok') {
            abort_code(403, 'webhook.signature_invalid');
        }
    }

    public function lireWebhook(Request $request): LectureDuWebhook
    {
        return new LectureDuWebhook(
            array_map(fn (array $m) => new MessageEntrant(
                canal: self::NOM,
                telephone: $m['de'],
                numeroDEntreprise: $m['vers'],
                identifiant: $m['id'],
                texte: $m['texte'] ?? null,
                cite: $m['cite'] ?? null,
                // TCK-2981 — `bouton` : la charge utile d'un bouton de réponse.
                reponseBouton: $m['bouton'] ?? null,
                media: isset($m['texte']) || isset($m['bouton']) ? null : 'photo',
            ), (array) $request->input('messages', [])),
            array_map(fn (array $a) => new AccuseEntrant($a['id'], $a['statut']), (array) $request->input('accuses', [])),
        );
    }

    public function appliquerAccuses(array $accuses): int
    {
        foreach ($accuses as $accuse) {
            self::$accuses[] = $accuse->identifiant.':'.$accuse->statut;
        }

        return count($accuses);
    }

    public function defiDAbonnement(Request $request): ?string
    {
        return null;
    }

    public function agenceDuNumero(string $numeroDEntreprise): int|false|null
    {
        return array_key_exists($numeroDEntreprise, self::$numeros) ? self::$numeros[$numeroDEntreprise] : false;
    }

    public function canalDuProspect(): ?string
    {
        return null;
    }

    public function accord(string $telephone): EtatDAccord
    {
        return self::$accords[$telephone] ?? EtatDAccord::Inconnu;
    }

    public function opposer(string $telephone, string $source): void
    {
        self::$accords[$telephone] = EtatDAccord::Oppose;
    }

    public function accorder(string $telephone, string $source, ?int $userId = null): void
    {
        self::$accords[$telephone] = EtatDAccord::Accorde;
        // TCK-2981 — le compte, seulement sous une source du pont (comme `WhatsappCloud::SOURCES_DU_COMPTE`).
        if (in_array($source, ['pont_invitation', 'pont_start'], true) && $userId !== null) {
            self::$comptes[$telephone] = $userId;
        }
    }

    public function compteAccordePour(string $telephone): ?int
    {
        return (self::$accords[$telephone] ?? null) === EtatDAccord::Accorde ? (self::$comptes[$telephone] ?? null) : null;
    }

    public function noterEntrant(MessageEntrant $message): void
    {
        self::$entrants[] = $message->identifiant;
    }
}
