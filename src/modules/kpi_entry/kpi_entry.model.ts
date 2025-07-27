import { model, Schema } from 'mongoose';
import z from 'zod';

const zValue = z.object({
  name: z.string().min(1),
  value: z.union([z.number(), z.string(), z.boolean()]),
  score: z.number(),
  comments: z.string().optional(),
  isByPassed: z.boolean().optional(),
});

const zKpiEntry = z.object({
  id: z.string().min(1),
  kpiTemplateId: z.string().min(1),
  values: z.array(zValue),
  totalScore: z.number(),
  status: z.enum(['created', 'initiated', 'generated']).default('created'),
  createdBy: z.string().min(1),
  createdFor: z.string().min(1),
  jurisdiction: z.array(z.string()).optional(), // For multiple KPI reference users
  month: z.number().min(1).max(12), // 1-12
  year: z.number().min(2020), // Year
  kpirefs: z.string().optional(), // For multiple KPI reference users
  createdAt: z.date(),
  updatedAt: z.date(),
});

const zKpiEntryCreate = zKpiEntry.omit({
  id: true,
  createdAt: true,
  totalScore: true,
  updatedAt: true,
  createdBy: true,
});

export type KpiEntry = z.infer<typeof zKpiEntry>;
export type KpiEntryCreate = z.infer<typeof zKpiEntryCreate>;

const valueSchema = new Schema({
  name: { type: String, required: true },
  value: { type: Schema.Types.Mixed, required: true },
  score: { type: Number, required: true },
  comments: { type: String, required: false },
  isByPassed: { type: Boolean, default: false },
});

const kpiEntrySchema = new Schema<KpiEntry>(
  {
    kpiTemplateId: { type: String, required: true },
    values: { type: [valueSchema], required: true },
    totalScore: { type: Number, required: true },
    status: {
      type: String,
      enum: ['created', 'initiated', 'generated'],
      default: 'created',
      required: true,
    },
    createdBy: { type: String, required: true },
    createdFor: { type: String, required: true },
    jurisdiction: { type: [String], required: false }, // For multiple KPI reference users
    kpirefs: { type: String, required: false }, // For multiple KPI reference users
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true, min: 2020 },
  },
  {
    timestamps: true,
  }
);

export const KpiEntryModel = model<KpiEntry>('tbl_kpi_entries', kpiEntrySchema);
