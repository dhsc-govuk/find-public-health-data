import { createContext } from 'react-router';

/**
 * How many indicators each page of search results shows. Both web apps set it on every request
 * from their config.
 */
export const searchPageSizeContext = createContext<number>();
