/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NODE_ENDPOINT: string;
  readonly VITE_PROGRAM_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.idl?raw" {
  const content: string;
  export default content;
}
