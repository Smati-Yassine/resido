import { ObjectId } from "mongodb";

export class InvalidIdError extends Error {}

export function toObjectId(id: string): ObjectId {
  if (!ObjectId.isValid(id)) {
    throw new InvalidIdError(`Invalid identifier: ${id}`);
  }
  return new ObjectId(id);
}

export function fromObjectId(id: ObjectId): string {
  return id.toHexString();
}
