import { Response } from 'express';
import { Favorite } from '../models/Favorite.js';
import { Level } from '../models/Level.js';
import { AuthRequest } from '../middleware/auth.js';

export const toggleFavorite = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { levelId } = req.params;

    const level = await Level.findById(levelId);
    if (!level) {
      res.status(404).json({ message: 'Level not found' });
      return;
    }

    const existing = await Favorite.findOne({ user: req.userId, level: levelId });

    if (existing) {
      await existing.deleteOne();
      await Level.findByIdAndUpdate(levelId, { $inc: { favorites: -1 } });
      res.json({ favorited: false });
    } else {
      await Favorite.create({ user: req.userId, level: levelId });
      await Level.findByIdAndUpdate(levelId, { $inc: { favorites: 1 } });
      res.json({ favorited: true });
    }
  } catch (error) {
    console.error('ToggleFavorite error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getFavorites = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const favorites = await Favorite.find({ user: req.userId })
      .populate({
        path: 'level',
        populate: { path: 'author', select: 'username' },
      })
      .sort({ createdAt: -1 });

    const levels = favorites.map((f) => f.level).filter(Boolean);
    res.json({ levels });
  } catch (error) {
    console.error('GetFavorites error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const checkFavorites = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { levelIds } = req.body;
    if (!levelIds || !Array.isArray(levelIds)) {
      res.json({ favoritedIds: [] });
      return;
    }

    const favorites = await Favorite.find({
      user: req.userId,
      level: { $in: levelIds },
    });

    const favoritedIds = favorites.map((f) => f.level.toString());
    res.json({ favoritedIds });
  } catch (error) {
    console.error('CheckFavorites error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
