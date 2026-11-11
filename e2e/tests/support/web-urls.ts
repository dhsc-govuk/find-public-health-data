// The base URLs of the public and internal sites. The defaults use 127.0.0.1 rather than localhost
// because the apps listen on IPv4, and Playwright's request client tries the IPv6 address ::1 first
// for localhost.
export const PUBLIC_WEB_URL = process.env.PUBLIC_WEB_URL ?? 'http://127.0.0.1:3000';
export const INTERNAL_WEB_URL = process.env.INTERNAL_WEB_URL ?? 'http://127.0.0.1:3001';
