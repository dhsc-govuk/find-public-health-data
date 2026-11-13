import type { SexGenderAndEthnicityFormValues } from '@fphd/internal-api-features/contract';

/** The boxes ticked in the group called `name`. */
function ticked(formData: FormData, name: string): string[] {
  return formData.getAll(name).filter((value) => typeof value === 'string');
}

/** The boxes ticked in each group. The browser sends nothing for a group with none ticked. */
export function readSexGenderAndEthnicityForm(formData: FormData): SexGenderAndEthnicityFormValues {
  return {
    demographics: ticked(formData, 'demographics'),
    sexes: ticked(formData, 'sexes'),
    genders: ticked(formData, 'genders'),
    ethnicGroups: ticked(formData, 'ethnicGroups'),
  };
}
