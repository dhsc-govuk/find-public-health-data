import { createContext } from 'react-router';

/**
 * The address the phase banner asks for feedback at. Both web apps set it on every request, to
 * undefined when no mailbox is configured, so reading it never throws.
 */
export const feedbackMailboxContext = createContext<string | undefined>();
