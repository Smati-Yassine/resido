import type { ClientSession } from "mongodb";
import { getMongoClient } from "@/lib/db/client";

/**
 * Wraps a unit of work in a MongoDB multi-document transaction. Used only
 * for the operations documented in docs/03-mongodb-architecture.md
 * #transaction-strategy — not for single-document writes or reads.
 */
export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const client = await getMongoClient();
  const session = client.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result as T;
  } finally {
    await session.endSession();
  }
}
