import { Router } from "express";
import {
    listUsers,
    getUserDetail,
    updateUserStatus,
    deleteUser,
    listReviewLevels,
    reviewLevel,
    listAllLevels,
    deleteLevelAdmin,
    updateLevelAdmin,
} from "../controllers/adminController.js";
import { auth, adminOnly } from "../middleware/auth.js";

const router = Router();

router.use(auth, adminOnly);

router.get("/users", listUsers);
router.get("/users/:userId", getUserDetail);
router.patch("/users/:userId", updateUserStatus);
router.delete("/users/:userId", deleteUser);

router.get("/levels", listReviewLevels);
router.get("/levels/all", listAllLevels);
router.patch("/levels/:levelId/review", reviewLevel);
router.patch("/levels/:levelId", updateLevelAdmin);
router.delete("/levels/:levelId", deleteLevelAdmin);

export default router;
