import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ILevel extends Document {
  code: string;
  meta: {
    name: string;
    id: string;
    difficulty: string;
    puzzleFormatVersion: number;
    angle: number;
    created: string;
    author: string;
    miniatureType: number;
  };
  grid: number[][];
  pieces: { color: string; segments: number[][] }[];
  author: Types.ObjectId;
  thumbnailData?: string;
  downloads: number;
  favorites: number;
  publishedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const levelSchema = new Schema<ILevel>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
    },
    meta: {
      name: { type: String, required: true },
      id: { type: String, required: true },
      difficulty: {
        type: String,
        required: true,
        enum: ['easy', 'medium', 'hard', 'expert'],
      },
      puzzleFormatVersion: { type: Number, default: 1 },
      angle: { type: Number, default: 180 },
      created: { type: String, required: true },
      author: { type: String, required: true },
      miniatureType: { type: Number, default: 0 },
    },
    grid: { type: [[Number]], required: true },
    pieces: [
      {
        color: { type: String, required: true },
        segments: { type: [[Number]], required: true },
      },
    ],
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    thumbnailData: { type: String },
    downloads: { type: Number, default: 0 },
    favorites: { type: Number, default: 0 },
    publishedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

levelSchema.index({ 'meta.difficulty': 1 });
levelSchema.index({ 'meta.name': 'text' });
levelSchema.index({ author: 1 });
levelSchema.index({ downloads: -1 });
levelSchema.index({ publishedAt: -1 });


export const Level = mongoose.model<ILevel>('Level', levelSchema);
