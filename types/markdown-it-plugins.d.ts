// The two plugins ship no types; each is a markdown-it plugin taking no options. Typed without
// markdown-it's own types, which only @fphd/ui depends on, as every package compiles this file.
declare module 'markdown-it-sub' {
  const sub: (md: object) => void;
  export default sub;
}

declare module 'markdown-it-sup' {
  const sup: (md: object) => void;
  export default sup;
}
