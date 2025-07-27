import { z } from 'zod';
import mongoose, { Schema, Document } from 'mongoose';
import { MemberModel } from '@/modules/members/members.model';
import logger from '@/configs/logger';

// Zod Schema for validation
export const UserZodSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email format'),
  emailVerified: z.boolean().default(false),
  image: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  role: z.enum(['user', 'admin']).optional(),
  banned: z.boolean().default(false),
  banReason: z.string().optional(),
  banExpires: z.string().optional(),
});

// TypeScript type derived from Zod schema
export type UserInput = z.input<typeof UserZodSchema>;
export type UserOutput = z.output<typeof UserZodSchema>;

// Mongoose Document interface
export interface IUser extends Document {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string;
  createdAt: Date;
  updatedAt: Date;
  role?: 'user' | 'admin';
  banned: boolean;
  banReason?: string;
  banExpires?: Date;
}

// Mongoose Schema
const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please enter a valid email',
      ],
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    image: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      default: 'user',
      enum: ['user', 'admin'],
    },
    banned: {
      type: Boolean,
      default: false,
    },
    banReason: {
      type: String,
      default: null,
    },
    banExpires: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // This automatically handles createdAt and updatedAt
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id as string;
        delete (ret as any)._id;
        delete (ret as any).__v;
        return ret;
      },
    },
  }
);

// Indexes for better query performance
UserSchema.index({ email: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ banned: 1 });
UserSchema.index({ createdAt: -1 });

// Pre-save middleware to ensure email is lowercase
// UserSchema.pre('save', function (next) {
// //   if (this.isModified('email')) {
// //     this.email = this.email.toLowerCase();
// //   }
//   next();
// });

// Static method to find user by email
UserSchema.statics.findByEmail = function (email: string) {
  return this.findOne({ email });
};

// Instance method to check if user is banned
UserSchema.methods.isBanned = function (): boolean {
  if (!this.banned) return false;

  if (this.banExpires && new Date() > this.banExpires) {
    // Ban has expired, update the document
    this.banned = false;
    this.banReason = undefined;
    this.banExpires = undefined;
    return false;
  }

  return true;
};

// ===== EVENT LISTENERS =====

// Import MemberModel for cascade delete

// Pre-deleteOne middleware - runs before user deletion
UserSchema.pre('deleteOne', async function (next) {
  try {
    // Get the user ID from the query
    const userId = this.getQuery()._id || this.getQuery().id;

    if (userId) {
      logger.info(
        `[User Event] Pre-deleteOne: About to delete user ${userId}, cleaning up related members...`
      );

      // Delete all member records associated with this user
      const deleteResult = await MemberModel.deleteMany({
        userId: userId.toString(),
      });

      logger.info(
        `[User Event] Pre-deleteOne: Deleted ${deleteResult.deletedCount} member records for user ${userId}`
      );
    }

    next();
  } catch (error) {
    logger.error(
      '[User Event] Pre-deleteOne: Error cleaning up members:',
      error
    );
    next(error as Error);
  }
});

// Pre-findOneAndDelete middleware - runs before user deletion via findOneAndDelete
UserSchema.pre('findOneAndDelete', async function (next) {
  try {
    // Get the user ID from the query
    const userId = this.getQuery()._id || this.getQuery().id;

    if (userId) {
      logger.info(
        `[User Event] Pre-findOneAndDelete: About to delete user ${userId}, cleaning up related members...`
      );

      // Delete all member records associated with this user
      const deleteResult = await MemberModel.deleteMany({
        userId: userId.toString(),
      });

      logger.info(
        `[User Event] Pre-findOneAndDelete: Deleted ${deleteResult.deletedCount} member records for user ${userId}`
      );
    }

    next();
  } catch (error) {
    logger.error(
      '[User Event] Pre-findOneAndDelete: Error cleaning up members:',
      error
    );
    next(error as Error);
  }
});

// Pre-deleteMany middleware - runs before bulk user deletion
UserSchema.pre('deleteMany', async function (next) {
  try {
    // Get the query to find users that will be deleted
    const query = this.getQuery();

    logger.info(
      `[User Event] Pre-deleteMany: About to delete users matching query:`,
      query
    );

    // Find all users that will be deleted
    const usersToDelete = await this.model.find(query).select('_id');
    const userIds = usersToDelete.map((user) => user._id.toString());

    if (userIds.length > 0) {
      // Delete all member records associated with these users
      const deleteResult = await MemberModel.deleteMany({
        userId: { $in: userIds },
      });

      logger.info(
        `[User Event] Pre-deleteMany: Deleted ${deleteResult.deletedCount} member records for ${userIds.length} users`
      );
    }

    next();
  } catch (error) {
    logger.error(
      '[User Event] Pre-deleteMany: Error cleaning up members:',
      error
    );
    next(error as Error);
  }
});

// Post-deleteOne middleware - runs after user deletion
UserSchema.post('deleteOne', function (result) {
  logger.info(
    `[User Event] Post-deleteOne: User deletion completed, deleted count: ${result.deletedCount}`
  );
});

// Post-findOneAndDelete middleware - runs after user deletion via findOneAndDelete
UserSchema.post('findOneAndDelete', function (doc) {
  if (doc) {
    logger.info(
      `[User Event] Post-findOneAndDelete: User ${doc.email} deleted successfully`
    );
  }
});

// Post-deleteMany middleware - runs after bulk user deletion
UserSchema.post('deleteMany', function (result) {
  logger.info(
    `[User Event] Post-deleteMany: Bulk user deletion completed, deleted count: ${result.deletedCount}`
  );
});

// Export the model
export const UserModel = mongoose.model<IUser>('user', UserSchema);

// Validation function using Zod
export const validateUserInput = (data: unknown): UserInput => {
  return UserZodSchema.parse(data);
};

// Safe validation function that returns errors instead of throwing
export const safeValidateUserInput = (data: unknown) => {
  return UserZodSchema.safeParse(data);
};
