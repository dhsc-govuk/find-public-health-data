import type { CiMethod } from '@fphd/internal-api-features/contract';

/** Whether the draft holds a method that the list of methods no longer offers. */
export function holdsMethodNoLongerOffered(
  ciMethodId: string,
  methods: readonly CiMethod[],
): boolean {
  return ciMethodId !== '' && !methods.some(({ id }) => id === ciMethodId);
}
