// In-site demos are intentionally disabled. There is no secret manager in this
// project, so no provider credential can be stored safely, and no demo has
// been approved. This route never proxies anything; it always answers 404.
// See docs/DEMOS.md for what an approved demo would require.
export const dynamic = "force-dynamic";

const body = JSON.stringify({ error: "No approved in-site demo exists for this listing. Use the provider's official documentation." });

export function GET() {
  return new Response(body, { status: 404, headers: { "content-type": "application/json" } });
}
export const POST = GET;
export const PUT = GET;
export const DELETE = GET;
