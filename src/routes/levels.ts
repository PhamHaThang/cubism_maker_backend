import { Router } from 'express';
import {
  getLevels,
  getLevelByCode,
  createLevel,
  updateLevel,
  deleteLevel,
  getUserLevels,
  downloadLevel,
} from '../controllers/levelController.js';
import { auth } from '../middleware/auth.js';

const router = Router();

router.get('/', getLevels);
router.get('/code/:code', getLevelByCode);
router.get('/user/:userId', getUserLevels);
router.get('/vr/download/:code', downloadLevel);
router.post('/', auth, createLevel);
router.put('/:code', auth, updateLevel);
router.delete('/:code', auth, deleteLevel);

export default router;
