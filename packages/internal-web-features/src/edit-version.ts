import type { ActionFunctionArgs } from 'react-router';

/** The hidden field carrying the version of what a form was shown, which its save sends back. */
export const VERSION_FIELD = 'version';

/** The version the form was shown; empty when it sent none, for the API to refuse. */
export function readVersion(formData: FormData): string {
  const version = formData.get(VERSION_FIELD);
  return typeof version === 'string' ? version : '';
}

/** The form an action was sent, and the version of what it was shown. */
export interface VersionedSubmission {
  formData: FormData;
  version: string;
}

/**
 * The action of a form that saves only what it was shown. Each page it re-renders carries the
 * version the form was shown, unless a refusal as changed gave a newer one to save against.
 * The loader's version will not do: loaders run again after every action, so it may be newer
 * than the one the form was shown.
 */
export function versionedAction<State extends object>(
  submit: (args: ActionFunctionArgs, submission: VersionedSubmission) => Promise<State | Response>,
) {
  return async (args: ActionFunctionArgs): Promise<(State & { version: string }) | Response> => {
    const formData = await args.request.formData();
    const version = readVersion(formData);
    const result = await submit(args, { formData, version });

    return result instanceof Response ? result : { version, ...result };
  };
}
