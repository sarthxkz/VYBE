import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { config } from '../config.js';

export const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: config.DATABASE_URL, max: 10 }),
});

export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/** Stable key for an unordered user pair. */
export const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);
export const ordered = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);
