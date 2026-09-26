import { DestructiveBanner, Icons } from 'takussan';

export function PaymentFailed() {
  return (
    <DestructiveBanner icon={<Icons.CircleAlert className="size-4" />}>
      Le paiement n’a pas abouti. Vérifiez le numéro Wave puis réessayez.
    </DestructiveBanner>
  );
}

export function WithoutIcon() {
  return (
    <DestructiveBanner>
      Ce document dépasse 10 Mo. Compressez-le ou envoyez une photo de chaque page.
    </DestructiveBanner>
  );
}
