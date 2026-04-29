import { Router } from "express";
import {
    getLevels,
    getMainMenuLevels,
    getLevelByCode,
    createLevel,
    updateLevel,
    deleteLevel,
    getUserLevels,
    downloadLevel,
    getCustomLevelManifest,
    getMainMenuManifest,
} from "../controllers/levelController.js";
import { auth } from "../middleware/auth.js";

const router = Router();

// Static routes first — before any dynamic /:param routes
router.get("/manifest/custom-level", getCustomLevelManifest);
router.get("/manifest/main-menu", getMainMenuManifest);
router.get("/", getLevels);
router.get("/main-menu", getMainMenuLevels);
router.get("/code/:code", getLevelByCode);
router.get("/user/:userId", getUserLevels);
router.get("/vr/download/:code", downloadLevel);
router.post("/", auth, createLevel);
router.put("/:code", auth, updateLevel);
router.delete("/:code", auth, deleteLevel);

export default router;
