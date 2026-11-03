/** Any control character. Text holding one is refused, and Postgres refuses NUL outright. */
export const CONTROL_CHARACTER = /\p{Cc}/u;

/** Any control character except the newlines and tabs a textarea keeps. */
export const CONTROL_CHARACTER_BUT_NEWLINE_OR_TAB = /(?![\n\t])\p{Cc}/u;
