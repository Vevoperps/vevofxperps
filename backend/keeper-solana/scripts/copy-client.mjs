// Copies the shared program client into src/ before compiling, so tsc keeps
// one rootDir and the image carries one self-contained dist/. The copy is
// generated: edit backend/shared/solana/vevo-client.ts instead.
import {copyFileSync, mkdirSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const from = resolve(here, "../../shared/solana/vevo-client.ts");
const to = resolve(here, "../src/vevo-client.ts");

mkdirSync(dirname(to), {recursive: true});
copyFileSync(from, to);
console.log("copied shared/solana/vevo-client.ts -> src/vevo-client.ts");
