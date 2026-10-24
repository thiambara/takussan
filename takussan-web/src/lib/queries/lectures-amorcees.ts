/** TCK-1828 — une lecture faite par le serveur, à amorcer dans TanStack (`AmorceLectures`). */
export interface LectureAmorcee {
  readonly cle: readonly unknown[];
  readonly donnee: unknown;
  /** Quand la lecture a été faite : TanStack ne la relit pas avant son `staleTime`. */
  readonly lueA: number;
}
