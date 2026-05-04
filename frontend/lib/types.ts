export interface IntentItem {
  text: string;
  weight: number;
  source: string;
}

export interface FidelityRule {
  attribute: string;
  importance: number;
  rationale: string;
}

export interface SessionState {
  positive_intent: IntentItem[];
  negative_intent: IntentItem[];
  fidelity_rules: FidelityRule[];
  product_description: string;
  strategy: string;
  revision: number;
}

export interface Candidate {
  index: number;
  image_b64: string;
  mime_type: string;
  width: number;
  height: number;
}

export interface ExportVariant {
  name: string;
  width: number;
  height: number;
  format: "jpeg" | "png" | "webp";
  background: string;
  crop_notes: string;
}

export interface EnhanceResponse {
  candidates: Candidate[];
  updated_state: SessionState;
  export_variants: ExportVariant[];
  duration_ms: number;
  attempts: number;
}

export interface FeedbackRequest {
  image_b64: string;
  mime_type: string;
  prior_state: SessionState;
  message: string;
  goal: string;
  marketplace: string;
  style_hints: string[];
  n_candidates: number;
}
