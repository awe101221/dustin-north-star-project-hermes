import type { Metadata } from "next";
import { ErrorPanel, PageHeader, NotConfigured } from "@/components/page-header";
import { SystemMapView } from "@/components/system/system-map-view";
import { getDatabaseReality } from "@/lib/db/underwriting";
import { underwritingReadClient } from "@/lib/supabase/server";
import { safeLoad } from "@/lib/server/safe";

export const metadata: Metadata = { title: "System Map" };
export const dynamic = "force-dynamic";

export default async function SystemPage() {
  const db = await underwritingReadClient();
  const header = <PageHeader
    eyebrow="Operating architecture · reality, not aspiration"
    title="How Dustin North Star Project Hermes works"
    description="A living map of the interfaces, agents, tools, source adapters, durable structures, database boundaries, and delivery system used to improve benchmark-relative decisions. Every component is labeled live, available, or planned."
    meta={<><span>Separate from old Awe Capital and AI Stack</span><span>·</span><span>Research only · Dustin approval required</span></>}
  />;
  if (!db) return <>{header}<NotConfigured /></>;
  const loaded = await safeLoad(() => getDatabaseReality(db));
  if (!loaded.ok) return <>{header}<ErrorPanel title="System map data failed to load" detail={loaded.error} /></>;
  return (
    <>
      {header}
      <SystemMapView database={loaded.data} />
    </>
  );
}
