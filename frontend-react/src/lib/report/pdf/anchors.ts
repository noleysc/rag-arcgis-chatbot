/** In-document link target for reference n (the References entry has id `ref-n`). */
export const refAnchor = (n: number) => `#ref-${n}`;

export const pad2 = (n: number) => String(n).padStart(2, "0");

/** react-pdf writes PDF outline entries for any node carrying `bookmark`,
 * though its TypeScript types only declare the prop on <Page>. */
export function bookmark(title: string): { id?: string } {
  return { bookmark: { title, fit: true } } as unknown as { id?: string };
}
