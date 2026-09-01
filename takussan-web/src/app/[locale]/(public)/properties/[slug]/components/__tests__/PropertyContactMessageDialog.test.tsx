/**
 * TCK-500, AC10 — le chemin ANONYME garde son formulaire et gagne le brouillon.
 *
 * Le régime du contact public est sans compte depuis TCK-161 : un visiteur non connecté ne doit
 * jamais être renvoyé vers la messagerie, qui exige une authentification. Ce qu'il gagne ici,
 * c'est le même message par défaut que le connecté — produit par la même fonction, pour que les
 * deux chemins ne dérivent pas l'un de l'autre.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { withIntl } from "@/test/intl";
import { ToastProvider } from "@/components/ui/toast";
import { PropertyContactMessageDialog } from "../PropertyContactMessageDialog";

const useAuthMock = vi.fn<() => { user: { id: number } | null }>();
vi.mock("@/context/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/app/actions/property", () => ({
  submitContactLead: vi.fn(),
  submitContactMessage: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/useContactMessage", () => ({
  useContactMessage: () => ({
    submit: vi.fn(),
    submitting: false,
    error: null,
  }),
}));

const BROUILLON =
  "Bonjour, je suis intéressé(e) par « Villa 4 pièces aux Almadies » (réf. TK-2451). Est-il toujours disponible ?";

// `ToastProvider` est monté par `(public)/layout.tsx` en production ; `vitest.setup.ts` ne monte
// aucun provider. Même harnais que `ContactSheet.tck-441.test.tsx`.
function monter() {
  render(
    withIntl(
      <ToastProvider>
        <PropertyContactMessageDialog
          slug="villa-almadies"
          open
          onOpenChange={vi.fn()}
          defaultMessage={BROUILLON}
        />
      </ToastProvider>,
    ),
  );
}

describe("<PropertyContactMessageDialog>", () => {
  it("pré-remplit le champ du formulaire anonyme, sans exiger de compte", () => {
    useAuthMock.mockReturnValue({ user: null });
    monter();

    expect(
      (screen.getByLabelText("Votre message") as HTMLTextAreaElement).value,
    ).toBe(BROUILLON);
    // Le formulaire de piste reste le formulaire de piste : nom et email, pas de connexion.
    expect(screen.getByLabelText("Nom complet")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("pré-remplit aussi le repli authentifié, pour que le champ ne dépende pas du réseau", () => {
    useAuthMock.mockReturnValue({ user: { id: 1 } });
    monter();

    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      BROUILLON,
    );
  });
});
