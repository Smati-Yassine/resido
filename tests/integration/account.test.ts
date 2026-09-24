import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db/client";
import { COLLECTIONS } from "@/lib/db/collections";
import * as users from "@/lib/domain/users/service";
import * as residences from "@/lib/domain/residences/service";
import * as account from "@/lib/domain/account/service";
import * as owners from "@/lib/domain/owners/service";
import * as payments from "@/lib/domain/payments/service";
import { insertMembership } from "@/lib/domain/memberships/repository";
import { withTransaction } from "@/lib/db/transaction";
import { buildAccountWorkbook } from "@/lib/export/account-workbook";
import { setupTestDb, unwrap, key, residenceWithOpenCycle, adminSession } from "./helpers";

setupTestDb();

async function registeredUserWithResidence() {
  const user = unwrap(
    await users.registerUser({ name: "Account Holder", email: `${key()}@test.tn`, password: "correct-horse" }),
  );
  const residence = unwrap(await residences.createResidence(user.id, { name: "Own", city: "" }));
  return { user, residence };
}

describe("account", () => {
  it("refuses purge and deletion with a wrong password", async () => {
    const { user } = await registeredUserWithResidence();
    expect(await account.purgeData(user.id, "nope")).toMatchObject({ ok: false, code: "WRONG_PASSWORD" });
    expect(await account.deleteAccount(user.id, "nope")).toMatchObject({ ok: false, code: "WRONG_PASSWORD" });
    expect(await residences.listResidenceCards(user.id)).toHaveLength(1);
  });

  it("purges the user's residences but keeps the account", async () => {
    const { user } = await registeredUserWithResidence();
    unwrap(await residences.createResidence(user.id, { name: "Second", city: "" }));
    expect(unwrap(await account.purgeData(user.id, "correct-horse"))).toEqual({
      residencesDeleted: 2,
      residencesLeft: 0,
    });
    expect(await residences.listResidenceCards(user.id)).toEqual([]);
    expect(await users.findUserById(user.id)).toMatchObject({ name: "Account Holder" });
  });

  it("deletes the account, its own residences, and only leaves shared ones", async () => {
    const { user, residence } = await registeredUserWithResidence();
    // A residence someone else created and shared with this user.
    const otherUserId = new ObjectId().toHexString();
    const shared = unwrap(await residences.createResidence(otherUserId, { name: "Shared", city: "" }));
    await withTransaction((s) => insertMembership({ userId: user.id, residenceId: shared.id, role: "VIEWER" }, s));

    expect(unwrap(await account.deleteAccount(user.id, "correct-horse"))).toEqual({
      residencesDeleted: 1,
      residencesLeft: 1,
    });

    const db = await getDb();
    expect(await users.findUserById(user.id)).toBeNull();
    expect(await db.collection(COLLECTIONS.organizations).countDocuments({ _id: new ObjectId(residence.id) })).toBe(0);
    expect(await residences.listResidenceCards(otherUserId)).toHaveLength(1);
    expect(await db.collection(COLLECTIONS.memberships).countDocuments({ userId: new ObjectId(user.id) })).toBe(0);
  });
});

describe("account export", () => {
  it("writes one sheet per record type with the residence's data", async () => {
    const { session, residence, lots: l, assessmentOf } = await residenceWithOpenCycle();
    unwrap(await owners.createOwner(session, residence.id, { name: "Owner X", lotIds: [l.a11.id] }));
    unwrap(
      await payments.recordPayment(session, residence.id, {
        date: "2026-02-01",
        method: "CHECK",
        note: "cheque 12",
        idempotencyKey: key(),
        allocations: [{ assessmentId: assessmentOf("A11"), amountMillimes: "250.500" }],
      }),
    );
    const full = unwrap(await residences.getResidence(adminSession(residence.id), residence.id));

    const buffer = await buildAccountWorkbook([full], "fr");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    expect(workbook.worksheets.map((w) => w.name)).toEqual([
      "Résidences",
      "Blocs",
      "Lots",
      "Propriétaires",
      "Cycles",
      "Charges",
      "Paiements",
      "Dépenses",
    ]);
    const lotsSheet = workbook.getWorksheet("Lots")!;
    expect(lotsSheet.getRow(3).values).toEqual([undefined, "Résidence Test", "A11", "Bloc A", "Owner X", 1000]);
    const paymentRow = workbook.getWorksheet("Paiements")!.getRow(3);
    expect(paymentRow.getCell(4).value).toBe("A11");
    expect(paymentRow.getCell(6).value).toBe("Chèque");
    expect(paymentRow.getCell(7).value).toBe("cheque 12");
    expect(paymentRow.getCell(8).value).toBe(250.5);
    expect(paymentRow.getCell(8).numFmt).toBe("#,##0.000");
  });
});
