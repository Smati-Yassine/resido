import { describe, expect, it } from "vitest";
import * as payments from "@/lib/domain/payments/service";
import * as residences from "@/lib/domain/residences/service";
import { setupTestDb, unwrap, key, residenceWithOpenCycle } from "./helpers";

setupTestDb();

describe("residence currency", () => {
  it("refuses a 2-decimal currency while amounts have millimes, and accepts it otherwise", async () => {
    const { session, residence, assessmentOf } = await residenceWithOpenCycle();
    // Lot charges in the fixture are whole dinars: EUR is fine.
    unwrap(await residences.setResidenceCurrency(session, residence.id, "EUR"));
    unwrap(await residences.setResidenceCurrency(session, residence.id, "TND"));
    unwrap(
      await payments.recordPayment(session, residence.id, {
        date: "2026-02-01",
        method: "CASH",
        idempotencyKey: key(),
        allocations: [{ assessmentId: assessmentOf("A11"), amountMillimes: "10.005" }],
      }),
    );
    expect(await residences.setResidenceCurrency(session, residence.id, "USD")).toMatchObject({
      ok: false,
      code: "CURRENCY_PRECISION",
    });
  });
});
