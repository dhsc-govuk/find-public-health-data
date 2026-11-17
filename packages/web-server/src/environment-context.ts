import type { EnvironmentName } from '@fphd/config';
import { createContext } from 'react-router';

/**
 * The environment the banner above the header names. Each web app sets it on every request,
 * to undefined on the live service, so reading it never throws.
 */
export const environmentContext = createContext<EnvironmentName | undefined>();
