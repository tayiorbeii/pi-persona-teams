declare module "node:fs" {
  export const createReadStream: any;
  export const existsSync: any;
  export const mkdirSync: any;
  export const readFileSync: any;
  export const readdirSync: any;
  export const statSync: any;
  export const writeFileSync: any;
}
declare module "node:path" {
  export const basename: any;
  export const dirname: any;
  export const isAbsolute: any;
  export const join: any;
  export const relative: any;
  export const resolve: any;
}
declare module "node:child_process" {
  export const execFileSync: any;
}
declare module "node:crypto" {
  export const createHash: any;
}
declare module "node:url" {
  export const fileURLToPath: any;
}
declare const process: {
  argv: string[];
  cwd(): string;
  env: Record<string, string | undefined>;
  exit(code?: number): never;
};
interface ImportMeta {
  dir: string;
}
declare const TextEncoder: {
  new (): { encode(input?: string): Uint8Array };
};
