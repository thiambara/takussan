<?php

namespace App\Models\Enums;

/**
 * TCK-2872 (ADR-0110 § 2) — une pièce du dossier d'une candidature ou d'une offre. Chaîne en base
 * (ADR-0007) ; le libellé appartient au front, et à `lang/{fr,en,wo}/bookings.php` (`dossier_pieces.<code>`)
 * pour le texte d'une notification rendu par l'API.
 *
 * La liste d'une réservation est FIXE PAR NATURE, posée à sa création ({@see self::forKind()}) ; un
 * garant déclaré ajoute `guarantor_commitment` et `guarantor_identity` (TCK-2893). `other` n'est
 * dans aucune liste fixe.
 */
enum DossierPiece: string
{
    case Identity = 'identity';
    case Payslips = 'payslips';
    case EmploymentCertificate = 'employment_certificate';
    case GuarantorCommitment = 'guarantor_commitment';
    case GuarantorIdentity = 'guarantor_identity';
    case ProofOfFunds = 'proof_of_funds';
    case Other = 'other';

    /**
     * La liste fixe d'une nature ; vide pour un séjour, qui n'a pas de dossier.
     *
     * @return list<self>
     */
    public static function forKind(BookingKind $kind): array
    {
        return match ($kind) {
            BookingKind::Application => [self::Identity, self::Payslips, self::EmploymentCertificate],
            BookingKind::Offer => [self::Identity, self::ProofOfFunds],
            BookingKind::Stay => [],
        };
    }

    /**
     * Les pièces qu'un garant déclaré ajoute à une candidature (ADR-0110 § 2, TCK-2893).
     *
     * @return list<self>
     */
    public static function forGuarantor(): array
    {
        return [self::GuarantorCommitment, self::GuarantorIdentity];
    }

    /** Le type du `Document` déposé pour cette pièce : une pièce d'identité, ou « autre ». */
    public function documentType(): DocumentType
    {
        return match ($this) {
            self::Identity, self::GuarantorIdentity => DocumentType::IdCard,
            default => DocumentType::Other,
        };
    }
}
