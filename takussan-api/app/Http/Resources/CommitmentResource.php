<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Commitment;
use App\Models\Enums\CommitmentStatus;
use App\Models\User;
use App\Policies\CommitmentPolicy;
use Illuminate\Http\Request;

/**
 * TCK-2969 (ADR-0130 § 2) — la projection d'un engagement : ce que rendent la carte du fil (résolue par
 * `ObjetsDesMessages`) et la liste des engagements d'un fil.
 *
 * Le porteur et le bénéficiaire : `id` et nom SANS contact (`nameWithoutContact`), jamais un téléphone
 * ni un e-mail. `etat` est dérivé à l'instant ({@see Commitment::etat()}). `abilities` est jugé par la
 * politique pour le lecteur ({@see self::forViewer()}), appelée directement : le super-admin n'y a aucun
 * geste.
 *
 * @mixin Commitment
 */
class CommitmentResource extends BaseResource
{
    private ?User $lecteur = null;

    public function forViewer(?User $lecteur): static
    {
        $this->lecteur = $lecteur;

        return $this;
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        /** @var Commitment $engagement */
        $engagement = $this->resource;

        return [
            'id' => $engagement->id,
            'title' => $engagement->title,
            'status' => $this->enumValue($engagement->status),
            'etat' => $engagement->etat(),
            'due_at' => $this->iso($engagement->due_at),
            'confirmed_at' => $this->iso($engagement->confirmed_at),
            'kept_at' => $this->iso($engagement->kept_at),
            'reopened_at' => $this->iso($engagement->reopened_at),
            'reopen_reason' => $engagement->reopen_reason,
            'holder' => self::personne($engagement->holder),
            'beneficiary' => self::personne($engagement->beneficiary),
            'object' => $engagement->object_type === null || $engagement->object_id === null
                ? null
                : ['type' => $engagement->object_type, 'id' => (int) $engagement->object_id],
            'abilities' => $this->when($this->lecteur !== null, fn () => $this->gestes($engagement)),
        ];
    }

    /** @return array{confirm: bool, cancel: bool, update: bool, keep: bool, reopen: bool, not_yet: bool, remind: bool} */
    private function gestes(Commitment $engagement): array
    {
        $politique = app(CommitmentPolicy::class);
        $lecteur = $this->lecteur;
        $ouvert = $engagement->status === CommitmentStatus::Open;

        return [
            'confirm' => $engagement->status === CommitmentStatus::Proposed && $politique->confirm($lecteur, $engagement),
            'cancel' => $engagement->enCours() && $politique->cancel($lecteur, $engagement),
            // TCK-2970 — qui ET état, comme la route : un geste offert est un geste accepté.
            'update' => $ouvert && $politique->update($lecteur, $engagement),
            'keep' => $ouvert && $politique->keep($lecteur, $engagement),
            'reopen' => $engagement->status === CommitmentStatus::Kept
                && $politique->reopen($lecteur, $engagement)
                && ($engagement->party_reopened_at === null || CommitmentPolicy::estPersonnel($lecteur, $engagement)),
            // L'ordre compte : la question ne se relit au fil (une requête) que pour le bénéficiaire.
            'not_yet' => $ouvert && $engagement->check_requested_at !== null
                && $politique->notYet($lecteur, $engagement) && $engagement->questionTenuOuverte(),
            'remind' => $engagement->etat() === Commitment::ETAT_EN_RETARD
                && ($engagement->last_relance_at === null || $engagement->last_relance_at->lessThanOrEqualTo(now()->subDay()))
                && $politique->remind($lecteur, $engagement),
        ];
    }

    /** @return array{id: int, name: string}|null */
    private static function personne(?User $personne): ?array
    {
        return $personne === null ? null : ['id' => (int) $personne->id, 'name' => $personne->nameWithoutContact()];
    }
}
