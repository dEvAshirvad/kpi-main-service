import z from 'zod';
import mongoose, { model, Schema } from 'mongoose';

const zMember = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  departmentSlug: z.string().min(1),
  role: z.string().min(1),
  metadata: z.record(z.string(), z.any()),
  createdAt: z.date(),
  updatedAt: z.date(),
});
const zMemberCreate = zMember.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Member = z.infer<typeof zMember>;
export type MemberCreate = z.infer<typeof zMemberCreate>;

const memberSchema = new Schema<Member>(
  {
    userId: { type: String, required: true },
    departmentSlug: { type: String, required: true },
    role: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  {
    timestamps: true,
  }
);

export const MemberModel = model<Member>('tbl_members', memberSchema);
