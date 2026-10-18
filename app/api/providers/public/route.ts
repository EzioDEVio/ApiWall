import { snapshot } from "@/lib/server/store";
import { toPublicPayload } from "@/lib/providers/service";
import { publicLogoOverrides } from "@/lib/logos/service";
import { safeLog } from "@/lib/security/secrets";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const data = snapshot();
    return Response.json({ ...toPublicPayload(data.submissions), logoOverrides: publicLogoOverrides(data.logos) }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    safeLog("public provider listing failed", (e as Error).message);
    return Response.json({ error: "Provider listings are unavailable." }, { status: 500 });
  }
}
