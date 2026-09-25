import { DraftKit } from "./kit.types";

// One row of the evaluator's input file (Appendix A case shape).
export interface EvaluationCase {
  id: string;
  jd: string;
  company_url: string;
  days: number;
}

export type EvaluationCaseResult =
  | { id: string; status: "ok"; kit: DraftKit }
  | { id: string; status: "failed"; error: string };

// The evaluator's output file shape (Appendix B).
export interface EvaluationOutput {
  version: "1.0";
  generated_at: string;
  kits: EvaluationCaseResult[];
}
