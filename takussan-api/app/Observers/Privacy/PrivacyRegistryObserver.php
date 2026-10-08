<?php

namespace App\Observers\Privacy;

use App\Models\AccountDeletionRequest;
use App\Models\DataExport;
use App\Models\Enums\DataExportStatus;
use App\Models\Enums\PrivacyRequestChannel;
use App\Models\Enums\PrivacyRequestStatus;
use App\Models\Enums\PrivacyRequestType;
use App\Models\PrivacyRequest;
use App\Models\User;

/**
 * TCK-601 (ADR-0044 §4) — le registre des demandes de droits se remplit SEUL quand la demande
 * passe par l'application : un export demandé par son titulaire est une demande de portabilité,
 * une demande d'effacement en est une d'effacement.
 *
 * ⚠ L'annulation d'un effacement SUPPRIME la demande (`AccountDeletionService::cancelDeletion`) et
 * la clé étrangère du registre est `nullOnDelete` : l'entrée se retrouve sur `deleting`, AVANT que
 * la base n'efface le lien, puis passe `withdrawn` — elle n'est jamais effacée avec la demande.
 */
class PrivacyRegistryObserver
{
    public function dataExportCreated(DataExport $export): void
    {
        // Un export lancé par la plateforme pour le compte d'un titulaire répond à une demande déjà
        // inscrite (saisie à la main) : il n'en ouvre pas une seconde.
        if ($export->requested_by !== null && (int) $export->requested_by !== (int) $export->user_id) {
            return;
        }

        $this->open(PrivacyRequestType::Portability, $export->user, ['data_export_id' => $export->id], $export->requested_at);
    }

    public function dataExportUpdated(DataExport $export): void
    {
        if ($export->wasChanged('status') && $export->status === DataExportStatus::Ready) {
            $this->answer(PrivacyRequest::query()->where('data_export_id', $export->id));
        }
    }

    public function deletionRequestCreated(AccountDeletionRequest $deletion): void
    {
        $this->open(PrivacyRequestType::Erasure, $deletion->user, ['account_deletion_request_id' => $deletion->id], $deletion->requested_at);
    }

    public function deletionRequestUpdated(AccountDeletionRequest $deletion): void
    {
        if ($deletion->wasChanged('executed_at') && $deletion->executed_at !== null) {
            $this->answer(PrivacyRequest::query()->where('account_deletion_request_id', $deletion->id));
        }
    }

    public function deletionRequestDeleting(AccountDeletionRequest $deletion): void
    {
        PrivacyRequest::query()
            ->where('account_deletion_request_id', $deletion->id)
            ->get()
            ->each(function (PrivacyRequest $entry): void {
                if ($entry->status->isOpen()) {
                    $entry->update(['status' => PrivacyRequestStatus::Withdrawn]);
                }
            });
    }

    /** @param  array<string, int>  $link */
    private function open(PrivacyRequestType $type, ?User $user, array $link, mixed $receivedAt): void
    {
        PrivacyRequest::query()->create($link + [
            'user_id' => $user?->id,
            'requester_name' => $user !== null ? $user->full_name : '—',
            'requester_contact' => $user?->email ?? $user?->phone,
            'type' => $type,
            'channel' => PrivacyRequestChannel::InApp,
            'received_at' => $receivedAt ?? now(),
            'status' => PrivacyRequestStatus::InProgress,
        ]);
    }

    /** Traitée par l'application elle-même : l'export est prêt, l'effacement exécuté. */
    private function answer($query): void
    {
        $query->get()->each(function (PrivacyRequest $entry): void {
            if ($entry->status->isOpen()) {
                $entry->update(['status' => PrivacyRequestStatus::Answered, 'answered_at' => now()]);
            }
        });
    }
}
