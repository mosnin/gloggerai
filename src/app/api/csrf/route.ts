import { issueCsrfToken } from "@/lib/api/csrf";
import { ok } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = await issueCsrfToken();
  return ok({ token });
}
