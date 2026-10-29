import type { ActionFunctionArgs } from 'react-router';

/** The hidden form field that holds the version. */
export const VERSION_FIELD = 'version';

/** The version the form sent, or an empty string if it sent none, which the API rejects. */
export function readVersion(formData: FormData): string {
  const version = formData.get(VERSION_FIELD);
  return typeof version === 'string' ? version : '';
}

/** The submitted form data and the version it contained. */
export interface VersionedSubmission {
  formData: FormData;
  version: string;
}

/**
 * Wraps the action of a form that sends a version. Every state the action returns keeps the
 * version the form was first shown, so the page goes on saving against it. The exception is a
 * `changed` error, which brings the current version, so the next save overwrites on purpose.
 *
 * The page can't use the loader's version instead. Loaders run again after every action, so
 * the loader may already have a newer version than the one the user saw.
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
