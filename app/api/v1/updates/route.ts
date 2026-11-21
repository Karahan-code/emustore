import { connection } from "next/server";
import { apiJson } from "@/lib/api/responses";
import { checkForUpdates } from "@/lib/updates/updater";

export async function GET(): Promise<Response> {
  await connection();
  return apiJson(await checkForUpdates());
}
