import { hermesClient, legacyClient, chunk } from "../lib/rest";
import { log } from "../lib/env";

/**
 * Imports broker executions recorded in the Dustin Awe Capital reference DB
 * (capital.realized_executions — IBKR realized-trade imports) into
 * hermes_trades so the Portfolio Hub trade log starts with real history.
 *
 * Idempotent through external_key = "ib-exec:<execution_key>". Rows are tagged
 * source="legacy_import:investment-brain"; the activity trigger skips them so
 * the timeline is not flooded.
 */
const SIDE: Record<string, string> = { BUY: "BUY", SELL: "SELL", BOT: "BUY", SLD: "SELL" };

async function main() {
  const legacy = legacyClient();
  const hermes = hermesClient();
  const executions = await legacy.selectAll<{
    execution_key: string;
    trade_time: string;
    symbol: string;
    company_name: string | null;
    asset_class: string | null;
    currency: string | null;
    side: string;
    quantity: string | null;
    price: string | null;
    realized_pnl_base: string | null;
    commission_base: string | null;
  }>("realized_executions", "select=execution_key,trade_time,symbol,company_name,asset_class,currency,side,quantity,price,realized_pnl_base,commission_base&order=trade_time.asc", { schema: "capital" });
  log(`reference DB: ${executions.length} executions`);

  const rows = executions.map((e) => {
    const qty = e.quantity !== null ? Number(e.quantity) : null;
    const price = e.price !== null ? Number(e.price) : null;
    const assetType = (e.asset_class ?? "STK").toUpperCase() === "OPT" ? "option" : (e.asset_class ?? "STK").toUpperCase() === "CASH" ? "fx" : "stock";
    return {
      external_key: `ib-exec:${e.execution_key}`,
      trade_time: e.trade_time,
      symbol: e.symbol.toUpperCase(),
      ticker: null,
      company_name: e.company_name,
      asset_type: assetType,
      side: SIDE[(e.side ?? "").toUpperCase()] ?? "OTHER",
      quantity: qty,
      price,
      currency: (e.currency ?? "USD").toUpperCase(),
      notional_usd: qty !== null && price !== null ? qty * price * (assetType === "option" ? 100 : 1) : null,
      fees_usd: e.commission_base !== null ? Number(e.commission_base) : null,
      realized_pnl_usd: e.realized_pnl_base !== null ? Number(e.realized_pnl_base) : null,
      sleeve_id: "ibkr-core",
      rationale: null,
      tags: ["ibkr", "import"],
      source: "legacy_import:investment-brain",
      source_ref: { table: "capital.realized_executions", execution_key: e.execution_key },
    };
  });
  for (const batch of chunk(rows, 200)) await hermes.upsert("hermes_trades", batch, "external_key");
  log(`upserted ${rows.length} trades; table now has ${await hermes.count("hermes_trades")} rows`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
