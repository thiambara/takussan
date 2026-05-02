/**
 * Motif géométrique abstrait inspiré du bogolan / tissages ouest-africains.
 * Volontairement non-figuratif : losanges + traits + points, rythme uniquement.
 * Utilisé en background à très faible opacité pour signer les sections.
 */
export function BogolanPattern({
  className,
  color = 'currentColor',
}: {
  className?: string;
  color?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern
          id="bogolan-tile"
          x="0"
          y="0"
          width="160"
          height="160"
          patternUnits="userSpaceOnUse"
        >
          {/* Losange central, contour seulement. */}
          <path
            d="M 80 32 L 112 80 L 80 128 L 48 80 Z"
            fill="none"
            stroke={color}
            strokeWidth="1.4"
          />
          {/* Petit losange plein au centre. */}
          <path d="M 80 70 L 90 80 L 80 90 L 70 80 Z" fill={color} />
          {/* Triple traits verticaux aux quatre coins. */}
          <g stroke={color} strokeWidth="1.4">
            <line x1="14" y1="14" x2="14" y2="34" />
            <line x1="22" y1="14" x2="22" y2="34" />
            <line x1="30" y1="14" x2="30" y2="34" />

            <line x1="130" y1="14" x2="130" y2="34" />
            <line x1="138" y1="14" x2="138" y2="34" />
            <line x1="146" y1="14" x2="146" y2="34" />

            <line x1="14" y1="126" x2="14" y2="146" />
            <line x1="22" y1="126" x2="22" y2="146" />
            <line x1="30" y1="126" x2="30" y2="146" />

            <line x1="130" y1="126" x2="130" y2="146" />
            <line x1="138" y1="126" x2="138" y2="146" />
            <line x1="146" y1="126" x2="146" y2="146" />
          </g>
          {/* Points de rythme. */}
          <g fill={color}>
            <circle cx="80" cy="14" r="1.6" />
            <circle cx="80" cy="146" r="1.6" />
            <circle cx="14" cy="80" r="1.6" />
            <circle cx="146" cy="80" r="1.6" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#bogolan-tile)" />
    </svg>
  );
}
