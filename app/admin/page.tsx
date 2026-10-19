import type { Metadata } from "next";
import Link from "next/link";
import { AdminConsole } from "@/components/AdminConsole";

export const metadata: Metadata = {
  title: "Requests (admin)",
  description: "Review requests to add APIs, logos and corrections.",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <div className="page narrow admin-page" data-testid="admin-page">
      <p className="eyebrow">Maintainers</p>
      <h1>Requests</h1>
      <p className="lede">
        Approve, reject or ask about requests sent through the <Link href="/submit/">Submit</Link> forms: new APIs, provider listings, logos and corrections. An
        approval becomes a pull request that publishes itself once every check passes.
      </p>
      <AdminConsole />
    </div>
  );
}
