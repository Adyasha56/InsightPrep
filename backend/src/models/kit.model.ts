import { Document, Schema, Types, model } from "mongoose";
import { GenerationError, GenerationStatus } from "../types/kit.types";

// Sub-schemas mirror src/types/kit.types.ts. `_id: false` because each
// element already carries its own stable `id` (r1, q1, f1, ...) assigned by
// application code — a second Mongo-generated _id would be redundant.
const requirementSchema = new Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    kind: { type: String, enum: ["technical", "behavioural", "domain"], required: true },
    priority: { type: String, enum: ["must", "nice"], required: true },
  },
  { _id: false }
);

const questionSchema = new Schema(
  {
    id: { type: String, required: true },
    prompt: { type: String, required: true },
    answer_outline: { type: String, required: true },
    difficulty: { type: Number, enum: [1, 2, 3], required: true },
    category: {
      type: String,
      enum: ["technical", "behavioural", "system-design", "company-fit"],
      required: true,
    },
    requirement_ids: { type: [String], default: [] },
  },
  { _id: false }
);

const flashcardSchema = new Schema(
  {
    id: { type: String, required: true },
    front: { type: String, required: true },
    back: { type: String, required: true },
    requirement_ids: { type: [String], default: [] },
  },
  { _id: false }
);

const companyBriefSchema = new Schema(
  {
    summary: { type: String, default: "" },
    what_they_do: { type: String, default: "" },
    sources: { type: [String], default: [] },
  },
  { _id: false }
);

const roleSchema = new Schema(
  {
    title: { type: String, default: "" },
    seniority: { type: String, default: "" },
    responsibilities: { type: [String], default: [] },
    requirements: { type: [requirementSchema], default: [] },
  },
  { _id: false }
);

const scheduleDaySchema = new Schema(
  {
    day: { type: Number, required: true },
    focus: { type: String, required: true },
    question_ids: { type: [String], default: [] },
    minutes: { type: Number, required: true },
  },
  { _id: false }
);

const scheduleSchema = new Schema(
  {
    days_available: { type: Number, required: true },
    days: { type: [scheduleDaySchema], default: [] },
  },
  { _id: false }
);

const coverageSchema = new Schema(
  {
    uncovered_requirement_ids: { type: [String], default: [] },
    passes: { type: Number, default: 0 },
  },
  { _id: false }
);

const kitSourceSchema = new Schema(
  {
    job_description: { type: String, required: true },
    company_url: { type: String, required: true },
    days_available: { type: Number, required: true },
  },
  { _id: false }
);

const generationErrorSchema = new Schema<GenerationError>(
  {
    code: { type: String, required: true },
    message: { type: String, required: true },
  },
  { _id: false }
);

export interface KitDocument extends Document {
  owner: Types.ObjectId;
  generationStatus: GenerationStatus;
  generationError?: GenerationError;
  source: { job_description: string; company_url: string; days_available: number };
  company_brief: { summary: string; what_they_do: string; sources: string[] };
  role: {
    title: string;
    seniority: string;
    responsibilities: string[];
    requirements: { id: string; text: string; kind: string; priority: string }[];
  };
  questions: {
    id: string;
    prompt: string;
    answer_outline: string;
    difficulty: number;
    category: string;
    requirement_ids: string[];
  }[];
  flashcards: { id: string; front: string; back: string; requirement_ids: string[] }[];
  schedule: {
    days_available: number;
    days: { day: number; focus: string; question_ids: string[]; minutes: number }[];
  };
  coverage: { uncovered_requirement_ids: string[]; passes: number };
  createdAt: Date;
  updatedAt: Date;
}

const kitSchema = new Schema<KitDocument>(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    generationStatus: {
      type: String,
      enum: ["idle", "researching", "generating", "completed", "failed"],
      default: "idle",
    },
    generationError: { type: generationErrorSchema, required: false },
    source: { type: kitSourceSchema, required: true },
    company_brief: { type: companyBriefSchema, default: () => ({}) },
    role: { type: roleSchema, default: () => ({}) },
    questions: { type: [questionSchema], default: [] },
    flashcards: { type: [flashcardSchema], default: [] },
    schedule: { type: scheduleSchema, required: true },
    coverage: { type: coverageSchema, default: () => ({}) },
  },
  { timestamps: true }
);

kitSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const { __v: _version, ...rest } = ret;
    return rest;
  },
});

export const Kit = model<KitDocument>("Kit", kitSchema);
