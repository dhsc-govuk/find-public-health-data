import { createContext } from 'react-router';

/**
 * The address the feedback link in public-web's phase banner emails. public-web sets it on every
 * request, to undefined when no mailbox is configured, so reading it never throws.
 */
export const feedbackMailboxContext = createContext<string | undefined>();
