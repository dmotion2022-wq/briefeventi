import { beforeAll, describe, expect, it } from "vitest";
import { setupTempDataDir } from "./helpers/temp-db";

setupTempDataDir();
delete process.env.VERCEL;
delete process.env.RUN_MODE;

let runs: typeof import("@/worker/runs");
let db: typeof import("@/db/client");
let execute: typeof import("@/worker/execute");

beforeAll(async () => {
  db = await import("@/db/client");
  await (await import("@/db/prepare")).prepareDb();
  runs = await import("@/worker/runs");
  execute = await import("@/worker/execute");
});

const setToken = async (id: string, token: string) => {
  const { eq } = await import("drizzle-orm");
  await db.getDb().update(db.schema.aiRuns).set({ dispatchToken: token }).where(eq(db.schema.aiRuns.id, id)).run();
};

describe("lavori in cloud", () => {
  it("un lavoro si prende in carico solo con il gettone giusto, e una volta sola", async () => {
    const id = await runs.enqueueRun({ task: "system.selftest", input: { steps: 1 } });
    await setToken(id, "gettone-giusto-0123456789");
    expect(await runs.claimRun(id, "")).toBeUndefined();
    expect(await runs.claimRun(id, "gettone-sbagliato")).toBeUndefined();
    const run = await runs.claimRun(id, "gettone-giusto-0123456789");
    expect(run?.status).toBe("running");
    expect(run?.dispatchToken).toBeNull();
    expect(await runs.claimRun(id, "gettone-giusto-0123456789")).toBeUndefined();
  });

  it("un lavoro diviso in parti torna in coda con il nuovo input e poi finisce", async () => {
    const id = await runs.enqueueRun({ task: "system.selftest", input: { steps: 1, chunks: 2 } });
    await setToken(id, "t1-0123456789abcdef");
    await execute.executeRun((await runs.claimRun(id, "t1-0123456789abcdef"))!, { log: () => {} });
    let run = await runs.getRun(id);
    expect(run?.status).toBe("queued");
    expect(run?.input).toMatchObject({ chunks: 2, done: 1 });
    await setToken(id, "t2-0123456789abcdef");
    await execute.executeRun((await runs.claimRun(id, "t2-0123456789abcdef"))!, { log: () => {} });
    run = await runs.getRun(id);
    expect(run?.status).toBe("done");
    expect(run?.output).toMatchObject({ ok: true, chunks: 2 });
  });

  it("un lavoro in corso senza battito da troppo risulta interrotto", async () => {
    const { eq } = await import("drizzle-orm");
    const id = await runs.enqueueRun({ task: "system.selftest" });
    const old = new Date(Date.now() - runs.STALE_RUN_MS - 5000).toISOString();
    await db.getDb().update(db.schema.aiRuns).set({ status: "running", heartbeatAt: old }).where(eq(db.schema.aiRuns.id, id)).run();
    const fresh = await runs.enqueueRun({ task: "system.selftest" });
    await db.getDb().update(db.schema.aiRuns).set({ status: "running", heartbeatAt: new Date().toISOString() }).where(eq(db.schema.aiRuns.id, fresh)).run();
    await runs.reapStaleRuns();
    expect((await runs.getRun(id))?.status).toBe("interrupted");
    expect((await runs.getRun(fresh))?.status).toBe("running");
  });

  it("un task sconosciuto finisce in errore con un messaggio chiaro", async () => {
    const id = await runs.enqueueRun({ task: "non.esiste" });
    await setToken(id, "t3-0123456789abcdef");
    await execute.executeRun((await runs.claimRun(id, "t3-0123456789abcdef"))!, { log: () => {} });
    const run = await runs.getRun(id);
    expect(run?.status).toBe("failed");
    expect(run?.error).toMatch(/Task sconosciuto/);
  });
});

describe("sessioni", () => {
  it("valida solo sessioni non scadute di utenti attivi", async () => {
    const { userForToken, tokenId } = await import("@/auth/token");
    const { eq } = await import("drizzle-orm");
    const d = db.getDb();
    await d.insert(db.schema.users).values({ id: "usr_t", email: "t@esempio.test", name: "Test", passwordHash: "x" }).run();
    const token = "a".repeat(43);
    const future = new Date(Date.now() + 86400_000).toISOString();
    await d.insert(db.schema.sessions).values({ id: tokenId(token), userId: "usr_t", expiresAt: future, lastSeenAt: new Date().toISOString() }).run();
    expect((await userForToken(token))?.email).toBe("t@esempio.test");
    expect(await userForToken("b".repeat(43))).toBeNull();
    expect(await userForToken("corto")).toBeNull();
    await d.update(db.schema.users).set({ active: false }).where(eq(db.schema.users.id, "usr_t")).run();
    expect(await userForToken(token)).toBeNull();
    await d.update(db.schema.users).set({ active: true }).where(eq(db.schema.users.id, "usr_t")).run();
    await d.update(db.schema.sessions).set({ expiresAt: new Date(Date.now() - 1000).toISOString() }).where(eq(db.schema.sessions.id, tokenId(token))).run();
    expect(await userForToken(token)).toBeNull();
  });
});

describe("piattaforme nel database", () => {
  it("la prima preparazione le carica, la seconda non duplica né sovrascrive", async () => {
    const { PLATFORM_SEED } = await import("@/db/platforms-seed");
    const { eq } = await import("drizzle-orm");
    const d = db.getDb();
    const before = await d.select().from(db.schema.platforms).all();
    expect(before.length).toBe(PLATFORM_SEED.length);
    const first = before[0];
    await d.update(db.schema.platforms).set({ status: "in_uso", notes: "nota del team" }).where(eq(db.schema.platforms.id, first.id)).run();
    const { seedDefaults } = await import("@/db/seed");
    await seedDefaults(d);
    const after = await d.select().from(db.schema.platforms).all();
    expect(after.length).toBe(PLATFORM_SEED.length);
    const same = after.find((p) => p.id === first.id);
    expect(same?.status).toBe("in_uso");
    expect(same?.notes).toBe("nota del team");
  });
});
