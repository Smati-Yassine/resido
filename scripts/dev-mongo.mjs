import { MongoMemoryReplSet } from "mongodb-memory-server";
import fs from "node:fs";

const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
const uri = replSet.getUri();
fs.writeFileSync(".devdb-uri.txt", uri);
console.log("URI:", uri);
console.log("READY");
await new Promise(() => {});
