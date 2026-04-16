import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IFavorite extends Document {
  user: Types.ObjectId;
  level: Types.ObjectId;
  createdAt: Date;
}

const favoriteSchema = new Schema<IFavorite>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    level: { type: Schema.Types.ObjectId, ref: 'Level', required: true },
  },
  { timestamps: true }
);

favoriteSchema.index({ user: 1, level: 1 }, { unique: true });

export const Favorite = mongoose.model<IFavorite>('Favorite', favoriteSchema);
