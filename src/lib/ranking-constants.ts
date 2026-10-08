export const RANKING_LIMIT = 50;
export const RANKING_HORIZON_YEARS = 5;
export const RANKING_MAX_AGE_DAYS = 45;
export const SLEEVE_LABELS = { core: "North Star", "ai-regime": "AI Regime" } as const;
export type RankingSleeve = keyof typeof SLEEVE_LABELS;
