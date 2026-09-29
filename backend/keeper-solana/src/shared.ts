import {existsSync, readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

/**
 * The market table, read from `backend/shared/markets.json` at runtime — one
 * table for the program's listing script, this keeper and the site.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

const SHARED = [resolve(HERE, "../../shared"), resolve(HERE, "../shared"), resolve(process.cwd(), "shared")].find(
  (candidate) => existsSync(resolve(candidate, "markets.json")),
);

if (!SHARED) throw new Error("cannot find backend/shared/markets.json");

export interface MarketSpec {
  symbol: string;
  name: string;
  flag: string;
}

export const markets: MarketSpec[] = JSON.parse(readFileSync(resolve(SHARED, "markets.json"), "utf8")) as MarketSpec[];
