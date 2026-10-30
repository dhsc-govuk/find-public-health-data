import { createContext } from 'react-router';

/**
 * True where the app offers tools for building and testing the service, such as filling in a
 * draft with sample answers. The app sets it from APP_ENV; unset, the tools are refused.
 */
export const devToolsContext = createContext<boolean>(false);
