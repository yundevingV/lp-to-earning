export interface PositionAnalyzeResponse {
  success: boolean;
  meta?: {
    timestamp?: string;
    version?: string;
    execution_time_ms?: number;
  };
  data?: {
    position?: AnalyzePosition;
    rangeHealth?: AnalyzeRangeHealth;
  };
}

export interface AnalyzePosition {
  nftMint?: string;
  pool?: string;
  pair?: string;
  priceLower?: string;
  priceUpper?: string;
  status?: string;
  inRange?: boolean;
}

export interface AnalyzeRangeHealth {
  currentPrice?: string;
  distanceToLower?: string;
  distanceToUpper?: string;
  rangeWidth?: string;
  outOfRangeRisk?: "low" | "medium" | "high" | string;
}
