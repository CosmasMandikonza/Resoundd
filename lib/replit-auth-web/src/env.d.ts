interface ImportMetaEnv {
  /** Base public path the web app is served from (Vite-provided). */
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
