import { bareSymbol } from "@/lib/utils";

export const CURRENT_10_PLUS_10_TICKERS = ["MELI", "NU", "META", "GOOGL", "APPF", "ACN", "CRDO", "TCEHY", "ANET", "TSM", "VRT", "AMKR", "MU", "CAMT", "MRVL", "ASML", "ONTO", "FORM", "GEV", "RXRX"] as const;
export const COMPANY_MODEL_AS_OF = "2026-09-07T20:55:00.000Z";
export const QQQ_MODEL_HURDLE = 0.12;

export type ScenarioName = "Bear" | "Base" | "Bull";

export type CompanyModelScenario = {
  name: ScenarioName;
  probability: number;
  revenueCagr: number;
  targetMargin: number;
  exitMultipleLabel: string;
  exitMultiple: number;
  annualizedReturn: number;
  targetPrice: number;
  narrative: string;
};

export type CompanyFinancialModel = {
  ticker: string;
  asOf: string;
  metric: string;
  methodology: string;
  sourceLabel: string;
  baseline: {
    currentPrice: number;
    currency: string;
    revenueGrowth1y: number;
    revenueCagr3y: number;
    startingMargin: number;
    valuationLabel: string;
    valuationMultiple: number;
  };
  probabilityWeightedReturn: number;
  qqqHurdle: number;
  scenarios: CompanyModelScenario[];
  drivers: string[];
  risks: string[];
  monitoring: string[];
  dataQuality: string;
};

type ScenarioSeed = Omit<CompanyModelScenario, "targetPrice">;
type CompanyModelSeed = Omit<CompanyFinancialModel, "asOf" | "methodology" | "sourceLabel" | "baseline" | "probabilityWeightedReturn" | "qqqHurdle" | "scenarios"> & { scenarios: ScenarioSeed[] };

const MODEL_SEEDS: CompanyModelSeed[] = [
  {
    "ticker": "MELI",
    "metric": "Year-5 operating margin",
    "scenarios": [
      {
        "name": "Bear",
        "probability": 0.2,
        "revenueCagr": 0.14,
        "targetMargin": 0.08,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 14,
        "annualizedReturn": -0.05,
        "narrative": "Commerce normalizes, credit losses and logistics costs constrain profitability, and valuation compresses despite continued ecosystem growth."
      },
      {
        "name": "Base",
        "probability": 0.55,
        "revenueCagr": 0.22,
        "targetMargin": 0.13,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 24,
        "annualizedReturn": 0.27,
        "narrative": "Commerce, advertising, logistics, payments, and credit compound together while operating leverage supports moderate margin expansion."
      },
      {
        "name": "Bull",
        "probability": 0.25,
        "revenueCagr": 0.28,
        "targetMargin": 0.17,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 30,
        "annualizedReturn": 0.61,
        "narrative": "MercadoLibre extends its regional network effects, advertising and fintech scale faster than expected, and credit performance remains disciplined."
      }
    ],
    "drivers": [
      "E-commerce penetration and gross merchandise volume growth across Latin America",
      "Mercado Pago engagement, credit underwriting, and monetization per user",
      "Advertising growth and logistics density driving incremental margins"
    ],
    "risks": [
      "Credit losses, funding costs, or liquidity stress within Mercado Pago",
      "Currency volatility, regulation, taxation, and political instability across key markets",
      "Competition from global and local commerce, banking, and payment platforms"
    ],
    "monitoring": [
      "Constant-currency commerce growth, buyer frequency, and fulfillment penetration",
      "Credit portfolio growth, non-performing loans, provisions, and risk-adjusted margin",
      "Advertising penetration, fintech take rate, and consolidated operating margin"
    ],
    "dataQuality": "Yahoo and FinanceToolkit are unofficial secondary sources; MELI operating margin differs materially between Yahoo's 6.7% trailing figure and FinanceToolkit's 11.1% FY2025 figure, while cash flow is distorted by fintech working-capital classifications, so returns are calibrated to the existing North Star model rather than a fully reconciled segment model."
  },
  {
    "ticker": "NU",
    "metric": "Year-5 net margin",
    "scenarios": [
      {
        "name": "Bear",
        "probability": 0.2,
        "revenueCagr": 0.12,
        "targetMargin": 0.18,
        "exitMultipleLabel": "EV/Revenue",
        "exitMultiple": 2.5,
        "annualizedReturn": -0.1,
        "narrative": "Customer growth continues but credit normalization, regulation, and higher funding costs expose less durable unit economics."
      },
      {
        "name": "Base",
        "probability": 0.45,
        "revenueCagr": 0.24,
        "targetMargin": 0.27,
        "exitMultipleLabel": "EV/Revenue",
        "exitMultiple": 5.5,
        "annualizedReturn": 0.29,
        "narrative": "Nu deepens monetization in Brazil while Mexico and Colombia scale, with disciplined underwriting sustaining attractive profitability."
      },
      {
        "name": "Bull",
        "probability": 0.35,
        "revenueCagr": 0.34,
        "targetMargin": 0.33,
        "exitMultipleLabel": "EV/Revenue",
        "exitMultiple": 8,
        "annualizedReturn": 0.585,
        "narrative": "Nu becomes a broader regional financial platform as product adoption, deposits, and operating leverage materially exceed expectations."
      }
    ],
    "drivers": [
      "Active-customer growth and products used per customer",
      "Average revenue per active customer and deposit-led funding economics",
      "Credit underwriting, loss ratios, and expansion in Mexico and Colombia"
    ],
    "risks": [
      "A severe credit cycle or rapid unsecured-loan growth overwhelming provisions",
      "Regulatory intervention in interchange, pricing, capital, or consumer lending",
      "Funding-cost pressure, currency volatility, and competition from banks and fintechs"
    ],
    "monitoring": [
      "Delinquency vintages, non-performing loans, cost of risk, and coverage ratios",
      "Customer additions, activity rates, products per customer, and revenue per customer",
      "Deposit growth, net interest margin, efficiency ratio, and country-level profitability"
    ],
    "dataQuality": "Bank revenue and enterprise-value conventions are not standardized: FinanceToolkit reports FY2025 revenue of $10.6 billion and a 27.0% net margin versus Yahoo's $8.4 billion trailing revenue and 42.7% profit margin, while the prior thesis references a lower GuruFocus EV/Revenue starting multiple; use the modeled returns as a top-down calibration pending a cohort, capital, and credit-cycle model."
  },
  {
    "ticker": "META",
    "metric": "Year-5 operating margin",
    "scenarios": [
      {
        "name": "Bear",
        "probability": 0.2,
        "revenueCagr": 0.06,
        "targetMargin": 0.3,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 10,
        "annualizedReturn": -0.06,
        "narrative": "Advertising growth slows while AI infrastructure and Reality Labs absorb cash without enough incremental monetization."
      },
      {
        "name": "Base",
        "probability": 0.5,
        "revenueCagr": 0.12,
        "targetMargin": 0.4,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 15,
        "annualizedReturn": 0.14,
        "narrative": "AI recommendations and advertising tools sustain double-digit growth while disciplined core operations offset elevated infrastructure spending."
      },
      {
        "name": "Bull",
        "probability": 0.3,
        "revenueCagr": 0.17,
        "targetMargin": 0.44,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 24,
        "annualizedReturn": 0.28,
        "narrative": "AI materially improves engagement, advertiser returns, and business messaging while new monetization scales faster than capital intensity."
      }
    ],
    "drivers": [
      "AI-driven engagement, recommendation quality, and advertising conversion",
      "Reels, messaging, and click-to-message monetization",
      "Capital intensity, infrastructure utilization, and share repurchases"
    ],
    "risks": [
      "AI capex rising faster than incremental revenue and free cash flow",
      "Privacy, antitrust, content, or youth-safety regulation impairing platform economics",
      "Reality Labs losses and competitive pressure from short-form video and emerging interfaces"
    ],
    "monitoring": [
      "Ad impressions, price per ad, engagement, and advertiser return metrics",
      "Capital expenditures, depreciation, free cash flow, and operating-margin conversion",
      "Reality Labs losses and monetization progress in messaging, Reels, and AI products"
    ],
    "dataQuality": "Yahoo and FinanceToolkit agree broadly on profitability but report materially different free cash flow, approximately $21.6 billion versus $46.1 billion, likely because of period and capital-expenditure timing; scenario returns therefore use normalized margins and should be refreshed after reconciling capex, depreciation, and stock-based compensation."
  },
  {
    "ticker": "GOOGL",
    "metric": "Year-5 operating margin",
    "scenarios": [
      {
        "name": "Bear",
        "probability": 0.2,
        "revenueCagr": 0.05,
        "targetMargin": 0.26,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 14,
        "annualizedReturn": -0.05,
        "narrative": "AI interfaces weaken search economics, regulatory remedies reduce distribution advantages, and heavy infrastructure spending pressures margins."
      },
      {
        "name": "Base",
        "probability": 0.5,
        "revenueCagr": 0.11,
        "targetMargin": 0.32,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 25,
        "annualizedReturn": 0.15,
        "narrative": "Search remains resilient while YouTube, Cloud, Gemini, and disciplined capital returns sustain low-double-digit compounding."
      },
      {
        "name": "Bull",
        "probability": 0.3,
        "revenueCagr": 0.16,
        "targetMargin": 0.37,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 32,
        "annualizedReturn": 0.327,
        "narrative": "Gemini expands rather than cannibalizes search monetization as Cloud and TPU economics produce stronger growth and operating leverage."
      }
    ],
    "drivers": [
      "Search query growth and monetization across AI-generated answer formats",
      "Google Cloud revenue, backlog, operating margin, and AI workload share",
      "YouTube monetization, subscriptions, and capital returns"
    ],
    "risks": [
      "Generative AI reducing commercial search traffic or increasing serving costs",
      "Antitrust remedies affecting distribution, advertising technology, or business structure",
      "AI infrastructure spending failing to produce adequate incremental returns"
    ],
    "monitoring": [
      "Search revenue growth, query trends, commercial-query monetization, and AI serving cost",
      "Cloud growth, backlog, operating margin, and disclosed AI contribution",
      "Capex, depreciation, free cash flow, buybacks, and material antitrust remedies"
    ],
    "dataQuality": "Yahoo's 54.8% trailing profit margin and roughly $22.7 billion free cash flow conflict with FinanceToolkit's 32.8% FY2025 net margin and $73.3 billion free cash flow, indicating period, one-off, or classification anomalies; operating margin and EV/EBITDA are used, but primary filings must reconcile earnings and cash flow before relying on the return bridge."
  },
  {
    "ticker": "APPF",
    "metric": "Year-5 operating margin",
    "scenarios": [
      {
        "name": "Bear",
        "probability": 0.2,
        "revenueCagr": 0.09,
        "targetMargin": 0.14,
        "exitMultipleLabel": "EV/Revenue",
        "exitMultiple": 4,
        "annualizedReturn": -0.12,
        "narrative": "Property-market softness, narrower-than-expected addressable demand, and competition slow growth enough to compress the SaaS multiple."
      },
      {
        "name": "Base",
        "probability": 0.45,
        "revenueCagr": 0.17,
        "targetMargin": 0.22,
        "exitMultipleLabel": "EV/Revenue",
        "exitMultiple": 7,
        "annualizedReturn": 0.14,
        "narrative": "AppFolio sustains high-teens growth through pricing and workflow expansion while scale steadily lifts operating profitability."
      },
      {
        "name": "Bull",
        "probability": 0.35,
        "revenueCagr": 0.23,
        "targetMargin": 0.29,
        "exitMultipleLabel": "EV/Revenue",
        "exitMultiple": 10,
        "annualizedReturn": 0.357,
        "narrative": "AI automation, payments, and adjacent workflows deepen customer value and support durable growth with best-in-class vertical SaaS margins."
      }
    ],
    "drivers": [
      "Customer and managed-unit growth within property management",
      "Pricing, payments, insurance, and adjacent-product monetization",
      "AI-enabled workflow automation improving retention and operating leverage"
    ],
    "risks": [
      "A limited vertical addressable market or housing and property-management cyclicality",
      "Competitive pricing or product bundling from incumbent and emerging platforms",
      "Premium valuation, stock-based compensation, and execution risk during margin expansion"
    ],
    "monitoring": [
      "Revenue growth, customer count, managed units, and disclosed retention indicators",
      "Payments and value-added-services penetration plus revenue per customer",
      "Gross margin, operating margin, free-cash-flow margin, and stock-based compensation"
    ],
    "dataQuality": "Yahoo and FinanceToolkit are broadly aligned on revenue and margins, but neither snapshot provides ARR, retention, customer cohorts, or fully diluted share assumptions; EV/Revenue scenarios and returns should be treated as provisional until those SaaS operating metrics and stock-based compensation are sourced from primary filings."
  },
  {
    "ticker": "ACN",
    "metric": "5-year annualized total shareholder return, using a ratio-based revenue/margin/terminal-multiple bridge",
    "scenarios": [
      {
        "name": "Bear",
        "probability": 0.25,
        "revenueCagr": 0.02,
        "targetMargin": 0.14,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 8.0,
        "annualizedReturn": -0.03,
        "narrative": "GenAI automates billable work faster than it creates transformation demand, holding growth near inflation and compressing margins and the terminal multiple."
      },
      {
        "name": "Base",
        "probability": 0.5,
        "revenueCagr": 0.07,
        "targetMargin": 0.17,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 12.0,
        "annualizedReturn": 0.12,
        "narrative": "AI, cloud, data and security modernization reaccelerate bookings while delivery productivity supports modest margin expansion and a partial valuation recovery."
      },
      {
        "name": "Bull",
        "probability": 0.25,
        "revenueCagr": 0.11,
        "targetMargin": 0.19,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 16.0,
        "annualizedReturn": 0.302,
        "narrative": "Accenture becomes the scaled implementation and managed-services layer for enterprise AI, sustaining double-digit growth, stronger margins and premium rerating."
      }
    ],
    "drivers": [
      "Enterprise GenAI bookings converting into implementation and managed-services revenue.",
      "Cloud, data, security and core-modernization demand broadening beyond pilots.",
      "Automation-led delivery productivity, free-cash-flow conversion and disciplined repurchases."
    ],
    "risks": [
      "GenAI cannibalizes labor-based revenue and pricing faster than it creates new scope.",
      "Weak discretionary IT spending or delayed client budgets suppress bookings and utilization.",
      "Wage inflation, acquisition integration and currency translation erode margins or cash conversion."
    ],
    "monitoring": [
      "Quarterly new bookings, consulting versus managed-services growth and book-to-bill direction.",
      "GenAI bookings, disclosed revenue and conversion from pilots into scaled deployments.",
      "Operating margin, utilization, free-cash-flow conversion and net share-count change."
    ],
    "dataQuality": "Anchored to the 2026-09-07 Yahoo snapshot and FinanceToolkit FY2025 data: 4.2% three-year revenue CAGR, 15.6% operating margin and 8.8x Yahoo EV/EBITDA; Yahoo is unofficial, periods/adjustments differ, and no SEC pack was present, but USD reporting avoids a cross-currency bridge."
  },
  {
    "ticker": "CRDO",
    "metric": "5-year annualized total shareholder return, using a ratio-based revenue/margin/terminal-multiple bridge",
    "scenarios": [
      {
        "name": "Bear",
        "probability": 0.2,
        "revenueCagr": 0.12,
        "targetMargin": 0.18,
        "exitMultipleLabel": "EV/Revenue",
        "exitMultiple": 6.0,
        "annualizedReturn": -0.1,
        "narrative": "AEC demand normalizes, customer concentration limits pricing and competition intensifies, causing sharp deceleration, margin compression and severe multiple contraction."
      },
      {
        "name": "Base",
        "probability": 0.55,
        "revenueCagr": 0.28,
        "targetMargin": 0.32,
        "exitMultipleLabel": "EV/Revenue",
        "exitMultiple": 12.0,
        "annualizedReturn": 0.13,
        "narrative": "Credo compounds through AEC and high-speed SerDes adoption, but growth normalizes and the current premium valuation compresses despite durable profitability."
      },
      {
        "name": "Bull",
        "probability": 0.25,
        "revenueCagr": 0.45,
        "targetMargin": 0.4,
        "exitMultipleLabel": "EV/Revenue",
        "exitMultiple": 25.0,
        "annualizedReturn": 0.538,
        "narrative": "AECs become a dominant short-reach AI interconnect architecture and Credo converts design wins into sustained hyperscale share, operating leverage and a persistent scarcity premium."
      }
    ],
    "drivers": [
      "Active electrical cable penetration as AI clusters require lower-power, reliable short-reach connectivity.",
      "SerDes speed transitions to 800G and 1.6T expanding content per connection and design-win value.",
      "Operating leverage from a fabless model, high gross margins and a net-cash balance sheet."
    ],
    "risks": [
      "A small number of hyperscalers can delay programs, demand price concessions or insource connectivity silicon.",
      "Broadcom, Marvell, Nvidia or optical alternatives reduce AEC share or pricing durability.",
      "A roughly 20x snapshot EV/Revenue multiple leaves little protection against growth normalization or execution misses."
    ],
    "monitoring": [
      "Revenue concentration by customer and evidence that growth is diversifying across hyperscalers and products.",
      "AEC unit growth, 800G/1.6T design wins and disclosed production ramps versus qualification activity.",
      "Gross and operating margins, inventory growth, receivables and free-cash-flow conversion."
    ],
    "dataQuality": "Anchored to the 2026-09-07 Yahoo snapshot and FinanceToolkit FY2025 data: 93.5% three-year revenue CAGR, 33.3% operating margin and 19.7x Yahoo EV/Revenue; the extreme growth base, fiscal timing, customer concentration and unofficial Yahoo data make estimates unusually fragile."
  },
  {
    "ticker": "TCEHY",
    "metric": "5-year annualized total shareholder return, using a ratio-based revenue/margin/terminal-multiple bridge",
    "scenarios": [
      {
        "name": "Bear",
        "probability": 0.25,
        "revenueCagr": 0.04,
        "targetMargin": 0.27,
        "exitMultipleLabel": "Forward P/E",
        "exitMultiple": 9.0,
        "annualizedReturn": -0.08,
        "narrative": "Policy, macro and geopolitical pressure constrain monetization and capital returns, while slower growth and margin erosion entrench a deep China discount."
      },
      {
        "name": "Base",
        "probability": 0.5,
        "revenueCagr": 0.1,
        "targetMargin": 0.35,
        "exitMultipleLabel": "Forward P/E",
        "exitMultiple": 14.0,
        "annualizedReturn": 0.09,
        "narrative": "Games, video accounts, payments and cloud compound near low double digits, with modest margin gains and buybacks offset by a persistent country-risk discount."
      },
      {
        "name": "Bull",
        "probability": 0.25,
        "revenueCagr": 0.15,
        "targetMargin": 0.39,
        "exitMultipleLabel": "Forward P/E",
        "exitMultiple": 19.0,
        "annualizedReturn": 0.256,
        "narrative": "AI improves advertising, game production and cloud economics while strong buybacks and easing policy risk drive faster earnings growth and multiple normalization."
      }
    ],
    "drivers": [
      "WeChat engagement and ad-load improvements raising high-margin advertising monetization.",
      "Game pipeline execution, evergreen franchises and international mix supporting durable cash generation.",
      "Cloud and AI monetization plus buybacks converting free cash flow into per-share growth."
    ],
    "risks": [
      "Chinese regulation, data controls or geopolitical escalation impose a structurally higher discount rate.",
      "Games approvals, consumer weakness or competition slow monetization across core franchises.",
      "Capital allocation, VIE/ADR structure, FX and OTC liquidity prevent operating gains from reaching U.S. holders cleanly."
    ],
    "monitoring": [
      "Online-advertising, games and fintech/business-services growth with segment margin progression.",
      "Buyback spend, diluted share count, dividend policy and investee-portfolio monetization.",
      "China platform regulation, U.S.-China restrictions and the TCEHY-to-Hong-Kong listing/FX valuation bridge."
    ],
    "dataQuality": "FinanceToolkit statements are in CNY while TCEHY market data are in USD, so Yahoo EV/Revenue and EV/EBITDA are cross-currency artifacts and are excluded; the model uses forward P/E and ratio-based assumptions, with the OTC ADR/home-listing ratio and FX bridge requiring independent refresh."
  },
  {
    "ticker": "ANET",
    "metric": "5-year annualized total shareholder return, using a ratio-based revenue/margin/terminal-multiple bridge",
    "scenarios": [
      {
        "name": "Bear",
        "probability": 0.25,
        "revenueCagr": 0.1,
        "targetMargin": 0.35,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 22.0,
        "annualizedReturn": -0.15,
        "narrative": "AI networking growth disappoints, cloud titans optimize spending and competition pressures mix, driving margin normalization and a major premium-multiple unwind."
      },
      {
        "name": "Base",
        "probability": 0.5,
        "revenueCagr": 0.18,
        "targetMargin": 0.42,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 30.0,
        "annualizedReturn": 0.05,
        "narrative": "Ethernet gains AI-cluster relevance and Arista sustains high-teens growth, but excellent execution is offset by compression from the snapshot's near-50x EV/EBITDA."
      },
      {
        "name": "Bull",
        "probability": 0.25,
        "revenueCagr": 0.26,
        "targetMargin": 0.46,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 50.0,
        "annualizedReturn": 0.302,
        "narrative": "Arista becomes the preferred scale-out Ethernet fabric for AI, compounds share across cloud and enterprise, preserves elite margins and retains a scarcity multiple."
      }
    ],
    "drivers": [
      "Scale-out Ethernet adoption in AI clusters, including 800G and 1.6T switching transitions.",
      "EOS software, routing and campus expansion broadening the franchise beyond hyperscale switching.",
      "Engineering execution, merchant-silicon leverage and a net-cash model sustaining premium profitability."
    ],
    "risks": [
      "Microsoft and Meta concentration creates program timing, pricing and bargaining-power exposure.",
      "Nvidia InfiniBand, custom networking silicon or incumbent vendors limit Ethernet share gains.",
      "The snapshot's roughly 50x EV/EBITDA valuation amplifies downside from even modest growth or margin misses."
    ],
    "monitoring": [
      "Cloud-titan revenue growth, customer concentration and AI-networking contribution.",
      "800G/1.6T shipment ramps, AI-cluster design wins and Ethernet-versus-InfiniBand adoption evidence.",
      "Gross margin, operating margin, inventory/receivables and revenue guidance revisions."
    ],
    "dataQuality": "Anchored to the 2026-09-07 Yahoo snapshot and FinanceToolkit FY2025 data: 27.1% three-year revenue CAGR, 42.8% operating margin and 49.8x Yahoo EV/EBITDA; clean USD comparability, but Yahoo is unofficial and customer/program timing can distort annualized baselines."
  },
  {
    "ticker": "TSM",
    "metric": "5-year annualized total shareholder return, using a ratio-based revenue/margin/terminal-multiple bridge",
    "scenarios": [
      {
        "name": "Bear",
        "probability": 0.2,
        "revenueCagr": -0.05,
        "targetMargin": 0.32,
        "exitMultipleLabel": "Forward P/E",
        "exitMultiple": 10.0,
        "annualizedReturn": -0.2,
        "narrative": "A semiconductor downturn, overseas-fab dilution or Taiwan disruption impairs volumes and margins, while the geopolitical discount drives a severe derating."
      },
      {
        "name": "Base",
        "probability": 0.55,
        "revenueCagr": 0.1,
        "targetMargin": 0.49,
        "exitMultipleLabel": "Forward P/E",
        "exitMultiple": 18.0,
        "annualizedReturn": 0.04,
        "narrative": "Leading-edge nodes and advanced packaging support double-digit growth, but capex intensity, overseas dilution and a persistent geopolitical discount cap shareholder returns."
      },
      {
        "name": "Bull",
        "probability": 0.25,
        "revenueCagr": 0.18,
        "targetMargin": 0.56,
        "exitMultipleLabel": "Forward P/E",
        "exitMultiple": 25.0,
        "annualizedReturn": 0.232,
        "narrative": "AI compute demand extends, N2/A16 and CoWoS remain supply-constrained, pricing power persists and successful geographic diversification supports a higher terminal multiple."
      }
    ],
    "drivers": [
      "Leading-edge node share and N2/A16 ramps increasing wafer value and sustaining pricing power.",
      "CoWoS and other advanced-packaging capacity expansion monetizing the AI accelerator bottleneck.",
      "Scale, yields and customer trust reinforcing TSMC's foundry economics despite geographic diversification."
    ],
    "risks": [
      "Taiwan conflict, blockade or export controls create a low-frequency but potentially permanent capital-loss scenario.",
      "Overseas-fab costs, heavy capex and electricity or labor constraints dilute structural margins and free cash flow.",
      "AI demand normalization, customer concentration or internal foundry efforts weaken utilization and pricing."
    ],
    "monitoring": [
      "Monthly revenue and quarterly guidance, with HPC/AI mix and leading-edge node contribution.",
      "N2/A16 yields and utilization, CoWoS capacity additions, pricing and major-customer demand signals.",
      "Capex intensity, overseas-fab margin dilution, free-cash-flow conversion and Taiwan geopolitical indicators."
    ],
    "dataQuality": "TSM ADR market data are in USD while company statements are in TWD, making Yahoo EV/Sales and EV/EBITDA cross-currency artifacts; the model therefore uses forward P/E and ratio-based assumptions, and its return calibration inherits uncertainty from the ADR/home-listing/FX bridge and geopolitical tail risk."
  },
  {
    "ticker": "VRT",
    "metric": "5-year annualized shareholder return, probability-weighted and calibrated to the current snapshot valuation",
    "scenarios": [
      {
        "name": "Bear",
        "probability": 0.25,
        "revenueCagr": 0.08,
        "targetMargin": 0.17,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 16,
        "annualizedReturn": -0.18,
        "narrative": "AI infrastructure orders normalize, competition limits pricing and operating margin retraces as capacity catches demand; severe multiple compression follows."
      },
      {
        "name": "Base",
        "probability": 0.5,
        "revenueCagr": 0.13,
        "targetMargin": 0.21,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 24,
        "annualizedReturn": 0.03,
        "narrative": "Power and thermal demand remains structurally strong, but growth decelerates and a lower terminal multiple offsets sustained margin execution."
      },
      {
        "name": "Bull",
        "probability": 0.25,
        "revenueCagr": 0.18,
        "targetMargin": 0.24,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 32,
        "annualizedReturn": 0.27,
        "narrative": "High-density AI deployments extend the supply-constrained cycle, service mix and pricing expand margins, and Vertiv retains a premium infrastructure multiple."
      }
    ],
    "drivers": [
      "AI rack-density growth increasing power-distribution and liquid-cooling content per megawatt",
      "Backlog conversion, pricing discipline and manufacturing productivity",
      "Higher-margin services, controls and installed-base lifecycle revenue"
    ],
    "risks": [
      "Current valuation embeds prolonged high growth and leaves limited room for execution misses",
      "Hyperscaler capex digestion, order normalization or customer concentration",
      "Competition, component availability and capacity additions pressuring price or margins"
    ],
    "monitoring": [
      "Organic orders, backlog, book-to-bill and cancellation trends",
      "Adjusted operating margin, price-cost realization and free-cash-flow conversion",
      "Liquid-cooling revenue, capacity additions and hyperscaler capital-expenditure guidance"
    ],
    "dataQuality": "Yahoo and FinanceToolkit revenue and margin data are directionally consistent, with no obvious split or currency issue. SEC data is absent from the snapshot, and Yahoo valuation fields are unofficial point-in-time data. The 3.75% weighted return is close to the snapshot's 3.6% modeled return."
  },
  {
    "ticker": "AMKR",
    "metric": "5-year annualized shareholder return, probability-weighted and calibrated to the current snapshot valuation",
    "scenarios": [
      {
        "name": "Bear",
        "probability": 0.3,
        "revenueCagr": -0.02,
        "targetMargin": 0.05,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 6,
        "annualizedReturn": -0.12,
        "narrative": "Advanced-packaging investment fails to overcome OSAT cyclicality, utilization falls and pricing pressure returns margins toward trough levels."
      },
      {
        "name": "Base",
        "probability": 0.5,
        "revenueCagr": 0.06,
        "targetMargin": 0.09,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 8.5,
        "annualizedReturn": 0.01,
        "narrative": "Advanced packaging grows but remains diluted by lower-margin assembly and test; utilization improves modestly without a structural valuation rerating."
      },
      {
        "name": "Bull",
        "probability": 0.2,
        "revenueCagr": 0.12,
        "targetMargin": 0.13,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 11,
        "annualizedReturn": 0.17,
        "narrative": "Amkor wins meaningful high-density packaging programs, utilization stays high and richer mix produces a durable step-up in margins and valuation."
      }
    ],
    "drivers": [
      "Advanced packaging demand from AI accelerators, HBM, chiplets and high-performance computing",
      "Utilization of new capacity and resulting fixed-cost absorption",
      "Customer diversification and mix shift toward higher-value test and packaging"
    ],
    "risks": [
      "Commodity-like OSAT pricing and structurally modest margins",
      "Semiconductor inventory cycles causing utilization and cash-flow volatility",
      "Capital intensity, customer concentration and execution risk on new facilities"
    ],
    "monitoring": [
      "Advanced-products revenue mix and design-win disclosures",
      "Factory utilization, gross margin and return on invested capital",
      "Capital expenditure, free cash flow and customer inventory commentary"
    ],
    "dataQuality": "Yahoo and FinanceToolkit show no obvious split or currency mismatch, but the snapshot mixes stronger TTM growth with a negative 2022-2025 revenue CAGR. Free cash flow also differs materially by measurement period. SEC data is absent. The 0.3% weighted return matches the snapshot's 0.3% modeled return."
  },
  {
    "ticker": "MU",
    "metric": "5-year annualized shareholder return, probability-weighted and calibrated to the current snapshot valuation",
    "scenarios": [
      {
        "name": "Bear",
        "probability": 0.35,
        "revenueCagr": -0.06,
        "targetMargin": 0.12,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 6,
        "annualizedReturn": -0.25,
        "narrative": "HBM supply expands faster than demand, conventional DRAM and NAND pricing rolls over, and earnings revert sharply from peak-cycle levels."
      },
      {
        "name": "Base",
        "probability": 0.45,
        "revenueCagr": 0.03,
        "targetMargin": 0.23,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 8,
        "annualizedReturn": -0.1,
        "narrative": "HBM improves mix, but memory remains cyclical and normalized margins and valuation are well below the snapshot's unusually elevated run-rate data."
      },
      {
        "name": "Bull",
        "probability": 0.2,
        "revenueCagr": 0.1,
        "targetMargin": 0.32,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 10,
        "annualizedReturn": 0.095,
        "narrative": "HBM demand compounds, technology transitions constrain industry bit supply and disciplined capital spending sustains above-cycle profitability."
      }
    ],
    "drivers": [
      "HBM capacity, qualification and pricing across successive product generations",
      "Industry DRAM and NAND supply discipline relative to bit demand",
      "Yield improvement and mix shift toward data-center and high-value memory"
    ],
    "risks": [
      "Memory pricing and margins remain highly cyclical despite AI demand",
      "Competitor HBM expansion or qualification gains create oversupply",
      "Large fabrication capital requirements reduce free-cash-flow durability"
    ],
    "monitoring": [
      "DRAM and NAND average selling prices, bit shipments and inventory days",
      "HBM revenue, sold-out capacity commentary and customer qualifications",
      "Industry capital spending, gross margin and free cash flow through the cycle"
    ],
    "dataQuality": "Severe Yahoo split/unit anomaly: the snapshot reports a $1,016.59 price, approximately $1.15 trillion market cap, $90.3 billion TTM revenue and implausible 80.4% operating margin, while FinanceToolkit reports $37.4 billion FY2025 revenue and 26.2% operating margin. Returns are calibrated to the supplied snapshot and should not be relied upon until price, share count and units are normalized. The -11.35% weighted return is close to the snapshot's -11.3% modeled return."
  },
  {
    "ticker": "CAMT",
    "metric": "5-year annualized shareholder return, probability-weighted and calibrated to the current snapshot valuation",
    "scenarios": [
      {
        "name": "Bear",
        "probability": 0.25,
        "revenueCagr": 0.02,
        "targetMargin": 0.2,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 15,
        "annualizedReturn": -0.18,
        "narrative": "Advanced-packaging inspection orders prove cyclical, competitors constrain share and the valuation resets toward conventional semiconductor-equipment levels."
      },
      {
        "name": "Base",
        "probability": 0.5,
        "revenueCagr": 0.1,
        "targetMargin": 0.27,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 22,
        "annualizedReturn": -0.03,
        "narrative": "HBM and chiplet complexity support double-digit growth and stable margins, but substantial terminal multiple compression offsets operating gains."
      },
      {
        "name": "Bull",
        "probability": 0.25,
        "revenueCagr": 0.17,
        "targetMargin": 0.31,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 30,
        "annualizedReturn": 0.13,
        "narrative": "Camtek becomes a critical inspection bottleneck for HBM and heterogeneous integration, gaining share while sustaining premium margins."
      }
    ],
    "drivers": [
      "Inspection intensity per wafer and package as HBM and chiplet complexity rises",
      "Market share in advanced packaging and compound-semiconductor applications",
      "Gross-margin durability as product mix and service revenue improve"
    ],
    "risks": [
      "Current valuation assumes sustained advanced-packaging growth",
      "Semiconductor-equipment order cyclicality and customer concentration",
      "Competitive pressure from broader process-control vendors"
    ],
    "monitoring": [
      "Advanced-packaging and HBM-related order growth",
      "Backlog, book-to-bill, gross margin and operating margin",
      "Customer concentration, market-share evidence and peer results from Onto and FormFactor"
    ],
    "dataQuality": "Yahoo and FinanceToolkit revenue are closely aligned and no obvious split or currency mismatch is visible. Camtek is an Israeli foreign issuer and SEC data is absent from the snapshot, so primary-filing reconciliation remains necessary. Yahoo trailing and forward P/E differ sharply, indicating earnings-period or one-off sensitivity. The -2.75% weighted return is close to the snapshot's -2.7% modeled return."
  },
  {
    "ticker": "MRVL",
    "metric": "5-year annualized shareholder return, probability-weighted and calibrated to the current snapshot valuation",
    "scenarios": [
      {
        "name": "Bear",
        "probability": 0.25,
        "revenueCagr": 0.03,
        "targetMargin": 0.12,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 13,
        "annualizedReturn": -0.19,
        "narrative": "Custom-silicon ramps disappoint, customer concentration bites and networking competition drives growth and margins below expectations."
      },
      {
        "name": "Base",
        "probability": 0.5,
        "revenueCagr": 0.11,
        "targetMargin": 0.22,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 20,
        "annualizedReturn": -0.03,
        "narrative": "AI optics and custom silicon grow strongly, but concentration and normalization from the current premium valuation limit shareholder returns."
      },
      {
        "name": "Bull",
        "probability": 0.25,
        "revenueCagr": 0.18,
        "targetMargin": 0.29,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 28,
        "annualizedReturn": 0.145,
        "narrative": "Multiple hyperscaler programs reach volume, optical connectivity remains a bottleneck and operating leverage converts rapid AI revenue growth into durable margins."
      }
    ],
    "drivers": [
      "Volume ramps and program breadth in hyperscaler custom silicon",
      "Electro-optics, DSP and interconnect content growth within AI clusters",
      "Operating leverage as high-value data-center products become a larger revenue share"
    ],
    "risks": [
      "Very high starting EV/EBITDA and EV/revenue multiples",
      "Hyperscaler customer and program concentration with long qualification cycles",
      "Competitive pressure from Broadcom, Nvidia and internal customer silicon teams"
    ],
    "monitoring": [
      "Data-center and AI revenue growth, mix and forward guidance",
      "Custom-silicon program count, ramp timing and customer concentration",
      "GAAP and adjusted operating margins, stock compensation and free-cash-flow conversion"
    ],
    "dataQuality": "Yahoo and FinanceToolkit revenue are directionally reconcilable across TTM and fiscal periods, with no obvious split or currency issue. Reported net margin exceeds operating margin, so one-time or non-operating items should not be capitalized; GAAP and adjusted results require reconciliation. SEC data is absent. The -2.625% weighted return is close to the snapshot's -2.6% modeled return."
  },
  {
    "ticker": "ASML",
    "metric": "5-year revenue CAGR, year-5 operating margin, and terminal EV/EBITDA; ratio-based ADR return bridge",
    "scenarios": [
      {
        "name": "Bear",
        "probability": 0.25,
        "revenueCagr": 0.04,
        "targetMargin": 0.3,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 20,
        "annualizedReturn": -0.14,
        "narrative": "Export controls broaden, leading-edge fab timing slips, and High-NA adoption is slower; lower utilization and mix compress margins while the scarcity premium unwinds."
      },
      {
        "name": "Base",
        "probability": 0.5,
        "revenueCagr": 0.11,
        "targetMargin": 0.35,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 28,
        "annualizedReturn": -0.01,
        "narrative": "EUV layer intensity and installed-base service growth support low-double-digit sales, but a still-rich starting valuation largely offsets fundamental compounding."
      },
      {
        "name": "Bull",
        "probability": 0.25,
        "revenueCagr": 0.17,
        "targetMargin": 0.39,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 38,
        "annualizedReturn": 0.16,
        "narrative": "High-NA ramps on schedule, AI-driven leading-edge capacity remains supply constrained, and service plus mix lift margins while monopoly economics retain a premium multiple."
      }
    ],
    "drivers": [
      "High-NA EUV shipments, throughput and customer acceptance",
      "Leading-edge logic and DRAM wafer-fab-equipment spending",
      "Installed-base management sales and service gross margin"
    ],
    "risks": [
      "Broader China export restrictions or geopolitical disruption",
      "Customer fab delays and semiconductor capital-spending cyclicality",
      "High-NA execution, productivity or substitution shortfalls"
    ],
    "monitoring": [
      "Quarterly bookings, backlog conversion and EUV system mix",
      "High-NA shipment count, field productivity and customer capex plans",
      "China revenue mix, export-license changes and installed-base growth"
    ],
    "dataQuality": "Yahoo's ASML enterprise value (about $36.6T) and EV multiples are plainly unusable and likely reflect currency/unit mapping errors. The ADR market value is USD while ASML reports in EUR; this model therefore uses a ratio-based bridge and requires home-listing/filing verification before use."
  },
  {
    "ticker": "ONTO",
    "metric": "5-year revenue CAGR, year-5 operating margin, and terminal EV/EBITDA",
    "scenarios": [
      {
        "name": "Bear",
        "probability": 0.25,
        "revenueCagr": 0.04,
        "targetMargin": 0.15,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 20,
        "annualizedReturn": -0.2,
        "narrative": "Advanced-packaging projects normalize, memory stays cyclical, and competitive intensity prevents operating leverage; the elevated process-control multiple resets."
      },
      {
        "name": "Base",
        "probability": 0.5,
        "revenueCagr": 0.11,
        "targetMargin": 0.22,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 22,
        "annualizedReturn": -0.04,
        "narrative": "HBM and heterogeneous-integration metrology outgrow front-end equipment, but growth moderates and terminal valuation compresses enough to leave returns slightly negative."
      },
      {
        "name": "Bull",
        "probability": 0.25,
        "revenueCagr": 0.25,
        "targetMargin": 0.32,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 40,
        "annualizedReturn": 0.28,
        "narrative": "Advanced-packaging process-control intensity rises sharply, Onto gains share across inspection and lithography, and strong incremental margins sustain a scarce-asset premium."
      }
    ],
    "drivers": [
      "HBM and advanced-packaging process-control intensity",
      "Share gains in optical metrology, inspection and lithography",
      "Revenue mix and incremental margin from higher-value systems"
    ],
    "risks": [
      "Semiconductor equipment cycle and customer concentration",
      "Packaging inspection competition from larger or specialized peers",
      "Acquisition integration, working-capital and valuation-compression risk"
    ],
    "monitoring": [
      "Advanced-packaging revenue, bookings and backlog by application",
      "Gross margin, operating margin and free-cash-flow conversion",
      "Customer capex, HBM capacity additions and competitive wins"
    ],
    "dataQuality": "The snapshot's Yahoo TTM growth/margin fields differ sharply from FinanceToolkit FY2025 history, and Yahoo enterprise value appears low relative to market value and reported net cash. Reconcile TTM, acquisition effects and diluted shares to filings before relying on the return bridge."
  },
  {
    "ticker": "FORM",
    "metric": "5-year revenue CAGR, year-5 operating margin, and terminal EV/EBITDA",
    "scenarios": [
      {
        "name": "Bear",
        "probability": 0.25,
        "revenueCagr": 0.03,
        "targetMargin": 0.08,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 16,
        "annualizedReturn": -0.15,
        "narrative": "HBM probe demand proves cyclical, utilization weakens, and pricing limits margin expansion; the stock rerates toward conventional test-equipment economics."
      },
      {
        "name": "Base",
        "probability": 0.6,
        "revenueCagr": 0.12,
        "targetMargin": 0.16,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 25,
        "annualizedReturn": 0.02,
        "narrative": "Probe-card content rises with HBM and advanced packaging, but mixed legacy exposure and multiple normalization leave only modest compounding from the current valuation."
      },
      {
        "name": "Bull",
        "probability": 0.15,
        "revenueCagr": 0.22,
        "targetMargin": 0.23,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 34,
        "annualizedReturn": 0.17,
        "narrative": "FormFactor establishes durable HBM probe leadership, wins more advanced-logic content, and converts mix-led gross-margin gains into sustained operating leverage."
      }
    ],
    "drivers": [
      "HBM probe-card content per stack and qualification wins",
      "Advanced-node logic probe intensity and customer share",
      "Mix-driven gross margin and factory utilization"
    ],
    "risks": [
      "Memory-cycle reversal and concentrated customer spending",
      "Alternative probe architectures or competitor share gains",
      "Legacy systems exposure, execution and elevated starting multiple"
    ],
    "monitoring": [
      "Probe-card revenue by DRAM, foundry and logic end market",
      "HBM qualification wins, design share and capacity additions",
      "Gross margin, operating expenses and free-cash-flow conversion"
    ],
    "dataQuality": "Yahoo TTM growth and operating margin are far above FinanceToolkit FY2025 figures, while historical free cash flow is volatile. Normalize stock compensation, acquisition effects, tax items and current run-rate margins against filings."
  },
  {
    "ticker": "GEV",
    "metric": "5-year revenue CAGR, year-5 operating margin, and terminal EV/EBITDA",
    "scenarios": [
      {
        "name": "Bear",
        "probability": 0.25,
        "revenueCagr": 0.03,
        "targetMargin": 0.05,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 15,
        "annualizedReturn": -0.29,
        "narrative": "Power demand and grid orders slow, offshore-wind losses persist, and service execution disappoints; thin consolidated margins cannot support the scarcity multiple."
      },
      {
        "name": "Base",
        "probability": 0.55,
        "revenueCagr": 0.07,
        "targetMargin": 0.1,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 20,
        "annualizedReturn": -0.13,
        "narrative": "Gas Power and Electrification convert backlog with better service mix while Wind improves, but terminal multiple compression overwhelms respectable sales and margin growth."
      },
      {
        "name": "Bull",
        "probability": 0.2,
        "revenueCagr": 0.12,
        "targetMargin": 0.15,
        "exitMultipleLabel": "EV/EBITDA",
        "exitMultiple": 25,
        "annualizedReturn": 0.03,
        "narrative": "AI load growth, grid scarcity and gas-turbine demand sustain a long equipment-and-service cycle; execution and Wind restructuring lift consolidated margins materially."
      }
    ],
    "drivers": [
      "Gas-turbine orders, pricing and long-duration service attach",
      "Grid equipment backlog, capacity expansion and Electrification margins",
      "Wind loss reduction and offshore project-risk resolution"
    ],
    "risks": [
      "Valuation already discounts a prolonged power-scarcity supercycle",
      "Fixed-price project losses, supply-chain constraints and warranty exposure",
      "Policy, permitting and utility-capex delays"
    ],
    "monitoring": [
      "Orders, backlog, book-to-bill and cancellation terms by segment",
      "Gas Power and Electrification EBITDA margins and service mix",
      "Wind cash losses, offshore milestones and company-wide free cash flow"
    ],
    "dataQuality": "GEV's short post-spin history and Yahoo fields are noisy: trailing profit margin and free cash flow are distorted by non-operating, working-capital and separation items. Use segment adjusted EBITDA, backlog quality and normalized cash conversion from filings."
  },
  {
    "ticker": "RXRX",
    "metric": "5-year partner/platform revenue CAGR, year-5 operating margin, and terminal EV/Revenue plus pipeline value",
    "scenarios": [
      {
        "name": "Bear",
        "probability": 0.35,
        "revenueCagr": -0.1,
        "targetMargin": -3,
        "exitMultipleLabel": "EV/Revenue",
        "exitMultiple": 2,
        "annualizedReturn": -0.28,
        "narrative": "Clinical programs fail to validate the platform, partners do not replenish milestones, and cash burn forces repeated dilution; residual value approaches cash plus limited technology value."
      },
      {
        "name": "Base",
        "probability": 0.45,
        "revenueCagr": 0.25,
        "targetMargin": -0.5,
        "exitMultipleLabel": "EV/Revenue",
        "exitMultiple": 8,
        "annualizedReturn": -0.04,
        "narrative": "The platform generates intermittent milestones and selective pipeline progress, but remains subscale and loss-making; dilution absorbs most operating-value growth."
      },
      {
        "name": "Bull",
        "probability": 0.2,
        "revenueCagr": 0.65,
        "targetMargin": 0.2,
        "exitMultipleLabel": "EV/Revenue",
        "exitMultiple": 18,
        "annualizedReturn": 0.58,
        "narrative": "Multiple programs produce convincing clinical proof, major partners expand economics, and repeatable discovery-to-development productivity creates a profitable platform plus material risk-adjusted pipeline value."
      }
    ],
    "drivers": [
      "Clinical proof-of-concept and platform-to-patient translation",
      "Partner milestones, option exercises and new collaboration economics",
      "Cash runway, R&D productivity and pipeline prioritization"
    ],
    "risks": [
      "Binary clinical attrition and failure to validate causal biology",
      "Persistent cash burn, dilution and unfavorable financing conditions",
      "Lumpy collaboration revenue, partner concentration and execution complexity"
    ],
    "monitoring": [
      "Trial enrollment, readout timing, efficacy and safety versus benchmarks",
      "Upfronts, milestones, option exercises and partner program progression",
      "Quarterly cash burn, runway, share count and program-level spend"
    ],
    "dataQuality": "Revenue is milestone-driven rather than recurring, making CAGR and EV/Revenue fragile; Yahoo and FinanceToolkit also disagree on the latest revenue trend. Operating margin is not economically meaningful at today's scale, so the scenarios explicitly include dilution, cash runway and risk-adjusted pipeline/partner value."
  }
] as CompanyModelSeed[];

const BASELINES: Record<string, CompanyFinancialModel["baseline"]> = {
  "MELI": {
    "currentPrice": 1978.36,
    "currency": "USD",
    "revenueGrowth1y": 0.3906,
    "revenueCagr3y": 0.3891,
    "startingMargin": 0.1108,
    "valuationLabel": "EV/EBITDA",
    "valuationMultiple": 27.7
  },
  "NU": {
    "currentPrice": 15.37,
    "currency": "USD",
    "revenueGrowth1y": 0.285,
    "revenueCagr3y": 0.5293,
    "startingMargin": 0.27,
    "valuationLabel": "Forward P/E",
    "valuationMultiple": 13.4
  },
  "META": {
    "currentPrice": 616.77,
    "currency": "USD",
    "revenueGrowth1y": 0.2217,
    "revenueCagr3y": 0.1989,
    "startingMargin": 0.4144,
    "valuationLabel": "EV/EBITDA",
    "valuationMultiple": 14.5
  },
  "GOOGL": {
    "currentPrice": 338.46,
    "currency": "USD",
    "revenueGrowth1y": 0.1509,
    "revenueCagr3y": 0.1251,
    "startingMargin": 0.3203,
    "valuationLabel": "EV/EBITDA",
    "valuationMultiple": 23.3
  },
  "APPF": {
    "currentPrice": 214.28,
    "currency": "USD",
    "revenueGrowth1y": 0.1972,
    "revenueCagr3y": 0.2631,
    "startingMargin": 0.1608,
    "valuationLabel": "EV/Revenue",
    "valuationMultiple": 7.1
  },
  "ACN": {
    "currentPrice": 186.72,
    "currency": "USD",
    "revenueGrowth1y": 0.0736,
    "revenueCagr3y": 0.0419,
    "startingMargin": 0.1556,
    "valuationLabel": "EV/EBITDA",
    "valuationMultiple": 8.8
  },
  "CRDO": {
    "currentPrice": 170.57,
    "currency": "USD",
    "revenueGrowth1y": 2.0568,
    "revenueCagr3y": 0.9353,
    "startingMargin": 0.3333,
    "valuationLabel": "EV/Revenue",
    "valuationMultiple": 19.7
  },
  "TCEHY": {
    "currentPrice": 56.6,
    "currency": "USD",
    "revenueGrowth1y": 0.1386,
    "revenueCagr3y": 0.1067,
    "startingMargin": 0.3309,
    "valuationLabel": "Forward P/E",
    "valuationMultiple": 12.0
  },
  "ANET": {
    "currentPrice": 193.78,
    "currency": "USD",
    "revenueGrowth1y": 0.286,
    "revenueCagr3y": 0.2715,
    "startingMargin": 0.4282,
    "valuationLabel": "EV/EBITDA",
    "valuationMultiple": 49.8
  },
  "TSM": {
    "currentPrice": 428.91,
    "currency": "USD",
    "revenueGrowth1y": 0.3161,
    "revenueCagr3y": 0.1894,
    "startingMargin": 0.5083,
    "valuationLabel": "Forward P/E",
    "valuationMultiple": 24.0
  },
  "VRT": {
    "currentPrice": 280.53,
    "currency": "USD",
    "revenueGrowth1y": 0.2769,
    "revenueCagr3y": 0.2159,
    "startingMargin": 0.1854,
    "valuationLabel": "EV/EBITDA",
    "valuationMultiple": 40.4
  },
  "AMKR": {
    "currentPrice": 47.77,
    "currency": "USD",
    "revenueGrowth1y": 0.0618,
    "revenueCagr3y": -0.0184,
    "startingMargin": 0.0697,
    "valuationLabel": "EV/EBITDA",
    "valuationMultiple": 9.1
  },
  "MU": {
    "currentPrice": 1016.59,
    "currency": "USD",
    "revenueGrowth1y": 0.4885,
    "revenueCagr3y": 0.0671,
    "startingMargin": 0.2624,
    "valuationLabel": "EV/EBITDA",
    "valuationMultiple": 16.5
  },
  "CAMT": {
    "currentPrice": 145.72,
    "currency": "USD",
    "revenueGrowth1y": 0.1557,
    "revenueCagr3y": 0.1563,
    "startingMargin": 0.2584,
    "valuationLabel": "EV/EBITDA",
    "valuationMultiple": 50.3
  },
  "MRVL": {
    "currentPrice": 223.55,
    "currency": "USD",
    "revenueGrowth1y": 0.4209,
    "revenueCagr3y": 0.1145,
    "startingMargin": 0.1633,
    "valuationLabel": "EV/Revenue",
    "valuationMultiple": 20.9
  },
  "ASML": {
    "currentPrice": 1714.88,
    "currency": "USD",
    "revenueGrowth1y": 0.1558,
    "revenueCagr3y": 0.1555,
    "startingMargin": 0.346,
    "valuationLabel": "Price/Revenue",
    "valuationMultiple": 18.6
  },
  "ONTO": {
    "currentPrice": 268.01,
    "currency": "USD",
    "revenueGrowth1y": 0.0182,
    "revenueCagr3y": 0.0,
    "startingMargin": 0.1506,
    "valuationLabel": "EV/Revenue",
    "valuationMultiple": 11.4
  },
  "FORM": {
    "currentPrice": 103.9,
    "currency": "USD",
    "revenueGrowth1y": 0.028,
    "revenueCagr3y": 0.0162,
    "startingMargin": 0.0766,
    "valuationLabel": "EV/Revenue",
    "valuationMultiple": 8.6
  },
  "GEV": {
    "currentPrice": 941.95,
    "currency": "USD",
    "revenueGrowth1y": 0.0897,
    "revenueCagr3y": 0.0868,
    "startingMargin": 0.0365,
    "valuationLabel": "EV/EBITDA",
    "valuationMultiple": 61.9
  },
  "RXRX": {
    "currentPrice": 3.63,
    "currency": "USD",
    "revenueGrowth1y": 0.2696,
    "revenueCagr3y": 0.2323,
    "startingMargin": -8.7283,
    "valuationLabel": "EV/Revenue",
    "valuationMultiple": 26.7
  }
};

const METHODOLOGY =
  "Five-year, three-scenario operating model. Each case makes revenue growth, year-five margin, terminal valuation, and annualized shareholder return explicit. The probability-weighted return is compared with a 12% QQQ hurdle; scenario returns are top-down calibrations and must be refreshed when price, filings, or evidence change.";

function hydrateModel(seed: CompanyModelSeed): CompanyFinancialModel {
  const baseline = BASELINES[seed.ticker];
  if (!baseline) throw new Error(`Missing baseline for ${seed.ticker}`);
  const scenarios = seed.scenarios.map((scenario) => ({
    ...scenario,
    targetPrice: Math.round(baseline.currentPrice * (1 + scenario.annualizedReturn) ** 5 * 100) / 100,
  }));
  return {
    ...seed,
    asOf: COMPANY_MODEL_AS_OF,
    methodology: METHODOLOGY,
    sourceLabel: "Yahoo Finance + FinanceToolkit snapshot; scenario assumptions authored by Hermes",
    baseline,
    probabilityWeightedReturn: scenarios.reduce((sum, scenario) => sum + scenario.probability * scenario.annualizedReturn, 0),
    qqqHurdle: QQQ_MODEL_HURDLE,
    scenarios,
  };
}

const MODELS = new Map(MODEL_SEEDS.map((seed) => [seed.ticker, hydrateModel(seed)]));

export function getCompanyModel(ticker: string | null | undefined): CompanyFinancialModel | null {
  const symbol = bareSymbol(ticker).toUpperCase();
  return MODELS.get(symbol) ?? null;
}

export function weightedAnnualizedReturn(model: Pick<CompanyFinancialModel, "scenarios">) {
  return model.scenarios.reduce((sum, scenario) => sum + scenario.probability * scenario.annualizedReturn, 0);
}

export type CompanyForecastRow = { year: number; revenueIndex: number; margin: number; operatingProfitUnits: number };

export function buildForecastRows(model: CompanyFinancialModel, scenarioName: ScenarioName = "Base"): CompanyForecastRow[] {
  const scenario = model.scenarios.find((item) => item.name === scenarioName);
  if (!scenario) return [];
  return Array.from({ length: 6 }, (_, year) => {
    const revenueIndex = 100 * (1 + scenario.revenueCagr) ** year;
    const margin = model.baseline.startingMargin + (scenario.targetMargin - model.baseline.startingMargin) * (year / 5);
    return {
      year,
      revenueIndex: Math.round(revenueIndex * 10) / 10,
      margin,
      operatingProfitUnits: Math.round(revenueIndex * margin * 10) / 10,
    };
  });
}
