// Default to 127.0.0.1: the apps listen on IPv4 and the request client tries ::1 first.
export const PUBLIC_WEB_URL = process.env.PUBLIC_WEB_URL ?? 'http://127.0.0.1:3000';
export const INTERNAL_WEB_URL = process.env.INTERNAL_WEB_URL ?? 'http://127.0.0.1:3001';
