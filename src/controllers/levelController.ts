import { Request, Response } from "express";
import { Level } from "../models/Level.js";
import { Favorite } from "../models/Favorite.js";
import { User } from "../models/User.js";
import { AuthRequest } from "../middleware/auth.js";

const generateCode = (): string => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

const generateId = (): string => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let id = "";
    for (let i = 0; i < 16; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
};

const getCodeParam = (req: Request): string => {
    const rawCode = req.params.code;
    const code = Array.isArray(rawCode) ? rawCode[0] : rawCode;
    return String(code || "").toUpperCase();
};

const parseLevelStatus = (value: unknown): "public" | "private" | null => {
    if (value === undefined || value === null || value === "") {
        return "public";
    }
    if (value === "public" || value === "private") {
        return value;
    }
    // Backward compatibility for old payloads.
    if (value === "publish") return "public";
    return null;
};

export const getLevels = async (req: Request, res: Response): Promise<void> => {
    try {
        const {
            page = 1,
            limit = 12,
            difficulty,
            search,
            sort = "newest",
        } = req.query;
        const pageNum = Number(page);
        const limitNum = Number(limit);

        const filter: Record<string, unknown> = {
            status: { $in: ["public"] },
            isMainMenu: { $ne: true },
        };
        if (difficulty && difficulty !== "all")
            filter["meta.difficulty"] = difficulty;
        if (search) filter["meta.name"] = { $regex: search, $options: "i" };

        let sortObj: Record<string, 1 | -1> = { publishedAt: -1 };
        if (sort === "popular") sortObj = { downloads: -1 };
        if (sort === "favorites") sortObj = { favorites: -1 };
        if (sort === "oldest") sortObj = { publishedAt: 1 };

        const [levels, total] = await Promise.all([
            Level.find(filter)
                .sort(sortObj)
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .populate("author", "username")
                .lean(),
            Level.countDocuments(filter),
        ]);

        res.json({
            levels,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        console.error("GetLevels error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

export const getMainMenuLevels = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const { page = 1, limit = 9 } = req.query;
        const pageNum = Math.max(1, Number(page) || 1);
        const limitNum = Math.min(200, Math.max(1, Number(limit) || 9));

        const filter = {
            isMainMenu: true,
            status: { $in: ["public", "private"] },
        };

        const [levels, total] = await Promise.all([
            Level.find(filter)
                .sort({ publishedAt: -1 })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .populate("author", "username")
                .lean(),
            Level.countDocuments(filter),
        ]);

        res.json({
            levels,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        console.error("GetMainMenuLevels error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

export const getLevelByCode = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const level = await Level.findOne({
            code: getCodeParam(req),
        }).populate("author", "username");

        if (!level) {
            res.status(404).json({ message: "Level not found" });
            return;
        }

        res.json({ level });
    } catch (error) {
        console.error("GetLevelByCode error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

export const createLevel = async (
    req: AuthRequest,
    res: Response,
): Promise<void> => {
    try {
        // Accept both full meta payload and simplified {name, description, difficulty, blueprint}
        let meta = req.body.meta;
        let grid = req.body.grid;
        let pieces = req.body.pieces;
        const status = parseLevelStatus(req.body.status);
        const thumbnailData = req.body.thumbnailData;

        if (!status) {
            res.status(400).json({
                message: "status must be either public or private",
            });
            return;
        }

        let isMainMenu = false;
        if (req.body.isMainMenu !== undefined) {
            const user = await User.findById(req.userId);
            if (user?.isAdmin) {
                isMainMenu = Boolean(req.body.isMainMenu);
            }
        }

        // Simplified payload from browser editor
        if (!meta && req.body.name) {
            const {
                name,
                description,
                difficulty = "medium",
                timeSeconds = 0,
                blueprint,
            } = req.body;
            if (!blueprint?.grid || !blueprint?.pieces) {
                res.status(400).json({
                    message: "blueprint.grid and blueprint.pieces are required",
                });
                return;
            }

            const parsedTimeSeconds = Number(timeSeconds);
            if (
                Number.isNaN(parsedTimeSeconds) ||
                parsedTimeSeconds < 0 ||
                !Number.isFinite(parsedTimeSeconds)
            ) {
                res.status(400).json({
                    message: "timeSeconds must be a non-negative number",
                });
                return;
            }

            grid = blueprint.grid;
            pieces = blueprint.pieces;
            meta = {
                name,
                description: description || "",
                difficulty,
                timeLimitSeconds: Math.floor(parsedTimeSeconds),
                author: (req as any).username || "Anonymous",
                angle: 180,
                miniatureType: 0,
            };
        }

        if (!meta || !grid || !pieces) {
            res.status(400).json({
                message: "name/blueprint or meta/grid/pieces are required",
            });
            return;
        }

        // Generate unique code
        let code = generateCode();
        let attempts = 0;
        while (await Level.findOne({ code })) {
            code = generateCode();
            attempts++;
            if (attempts > 100) {
                res.status(500).json({
                    message: "Failed to generate unique code",
                });
                return;
            }
        }

        const now = new Date();
        // ISO 8601 UTC — parseable by UE5 FDateTime::ParseIso8601 and all platforms
        const created = now.toISOString();

        const level = await Level.create({
            status,
            code,
            isMainMenu,
            meta: {
                ...meta,
                id: generateId(),
                puzzleFormatVersion: 1,
                created,
                miniatureType: meta.miniatureType ?? 0,
                timeLimitSeconds: Math.max(
                    0,
                    Number(meta.timeLimitSeconds ?? 0),
                ),
            },
            grid,
            pieces,
            author: req.userId,
            thumbnailData,
        });

        await level.populate("author", "username");
        res.status(201).json({ level, code });
    } catch (error) {
        console.error("CreateLevel error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

export const updateLevel = async (
    req: AuthRequest,
    res: Response,
): Promise<void> => {
    try {
        const level = await Level.findOne({ code: getCodeParam(req) });

        if (!level) {
            res.status(404).json({ message: "Level not found" });
            return;
        }

        if (level.author.toString() !== req.userId) {
            res.status(403).json({ message: "Not authorized" });
            return;
        }

        const { meta, grid, pieces, thumbnailData } = req.body;
        const nextStatus =
            req.body.status === undefined
                ? undefined
                : parseLevelStatus(req.body.status);

        if (nextStatus === null) {
            res.status(400).json({
                message: "status must be either public or private",
            });
            return;
        }

        if (req.body.isMainMenu !== undefined) {
            const user = await User.findById(req.userId);
            if (user?.isAdmin) {
                level.isMainMenu = Boolean(req.body.isMainMenu);
            }
        }

        if (
            meta &&
            Object.prototype.hasOwnProperty.call(meta, "timeLimitSeconds")
        ) {
            const parsedTimeSeconds = Number(meta.timeLimitSeconds);
            if (
                Number.isNaN(parsedTimeSeconds) ||
                parsedTimeSeconds < 0 ||
                !Number.isFinite(parsedTimeSeconds)
            ) {
                res.status(400).json({
                    message:
                        "meta.timeLimitSeconds must be a non-negative number",
                });
                return;
            }
            meta.timeLimitSeconds = Math.floor(parsedTimeSeconds);
        }

        if (meta) Object.assign(level.meta, meta);
        if (grid) level.grid = grid;
        if (pieces) level.pieces = pieces;
        if (thumbnailData) level.thumbnailData = thumbnailData;
        // Normalize old persisted value before save.
        if (level.status !== "private") {
            level.status = "public";
        }
        if (nextStatus) level.status = nextStatus;

        await level.save();

        // Populate author for response
        const populatedLevel = await Level.findOne({
            code: getCodeParam(req),
        }).populate("author", "username");

        res.json({ level: populatedLevel });
    } catch (error) {
        console.error("UpdateLevel error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

export const deleteLevel = async (
    req: AuthRequest,
    res: Response,
): Promise<void> => {
    try {
        const level = await Level.findOne({ code: getCodeParam(req) });

        if (!level) {
            res.status(404).json({ message: "Level not found" });
            return;
        }

        if (level.author.toString() !== req.userId) {
            res.status(403).json({ message: "Not authorized" });
            return;
        }

        // Also remove associated favorites
        await Favorite.deleteMany({ level: level._id });
        await level.deleteOne();
        res.json({ message: "Level deleted" });
    } catch (error) {
        console.error("DeleteLevel error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

export const getUserLevels = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const {
            page = 1,
            limit = 12,
            difficulty,
            search,
            status,
            sort = "newest",
            isMainMenu,
        } = req.query;
        const pageNum = Number(page);
        const limitNum = Number(limit);

        const filter: Record<string, unknown> = { author: req.params.userId };
        if (difficulty && difficulty !== "all") {
            filter["meta.difficulty"] = difficulty;
        }
        if (search) {
            filter["meta.name"] = { $regex: search, $options: "i" };
        }
        if (status && status !== "all") {
            const parsedStatus = parseLevelStatus(status as string);
            if (!parsedStatus) {
                res.status(400).json({
                    message: "status must be either public or private",
                });
                return;
            }
            filter.status =
                parsedStatus === "public"
                    ? { $in: ["public", "publish"] }
                    : "private";
        }
        if (isMainMenu !== undefined && isMainMenu !== "all") {
            filter.isMainMenu = isMainMenu === "true";
        }

        let sortObj: Record<string, 1 | -1> = { publishedAt: -1 };
        if (sort === "oldest") sortObj = { publishedAt: 1 };
        if (sort === "name") sortObj = { "meta.name": 1 };

        const [levels, total] = await Promise.all([
            Level.find(filter)
                .sort(sortObj)
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .populate("author", "username")
                .lean(),
            Level.countDocuments(filter),
        ]);

        res.json({
            levels,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        console.error("GetUserLevels error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

export const downloadLevel = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        // ?source=app → UE5 app sync: don't inflate download counter
        const isAppSync = req.query.source === "app";

        const updateOp = isAppSync
            ? {} // App sync: don't increment counter
            : { $inc: { downloads: 1 } };

        const level = await Level.findOneAndUpdate(
            { code: getCodeParam(req) },
            updateOp,
            { new: true },
        );

        if (!level) {
            res.status(404).json({ message: "Level not found" });
            return;
        }

        const cubismData = {
            meta: level.meta,
            grid: level.grid,
            pieces: level.pieces,
        };

        // ETag based on updatedAt for conditional requests
        const etag = `"${level.updatedAt.getTime()}"`;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${level.meta.name}.cube"`,
        );
        res.setHeader("ETag", etag);
        res.setHeader("Cache-Control", "public, max-age=300"); // CDN cache 5 min
        res.setHeader("Access-Control-Expose-Headers", "ETag");

        // Support conditional request from app (If-None-Match)
        if (req.headers["if-none-match"] === etag) {
            res.status(304).end();
            return;
        }

        res.json(cubismData);
    } catch (error) {
        console.error("DownloadLevel error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

const buildManifestResponse = async (
    req: Request,
    res: Response,
    isMainMenu: boolean,
) => {
    try {
        const query: any = { status: "public" };
        if (isMainMenu) {
            query.isMainMenu = true;
        } else {
            query.isMainMenu = { $ne: true };
        }

        const levels = await Level.find(
            query,
            {
                code: 1,
                "meta.id": 1,
                "meta.name": 1,
                "meta.difficulty": 1,
                "meta.author": 1,
                "meta.timeLimitSeconds": 1,
                "meta.puzzleFormatVersion": 1,
                updatedAt: 1,
                publishedAt: 1,
            },
        )
            .sort({ publishedAt: -1 })
            .lean();

        // Build base URL from request — works both localhost and production
        const protocol = req.headers["x-forwarded-proto"] || req.protocol;
        const host = req.headers["x-forwarded-host"] || req.headers.host;
        const baseUrl = `${protocol}://${host}`;

        const manifest = {
            manifestVersion: 1, // schema version of the manifest structure itself
            generatedAt: new Date().toISOString(),
            levels: levels.map((lvl: any) => ({
                code: lvl.code,
                id: lvl.meta.id,
                name: lvl.meta.name,
                difficulty: lvl.meta.difficulty,
                author: lvl.meta.author,
                timeLimitSeconds: lvl.meta.timeLimitSeconds ?? 0,
                puzzleFormatVersion: lvl.meta.puzzleFormatVersion ?? 1,
                // updatedAt = "version" of the level. App diffs by this field.
                updatedAt: lvl.updatedAt.toISOString(),
                publishedAt: lvl.publishedAt?.toISOString() ?? lvl.updatedAt.toISOString(),
                downloadUrl: `${baseUrl}/api/levels/vr/download/${lvl.code}`,
            })),
        };

        // Manifest should NOT be cached — app needs the latest version every fetch
        res.setHeader("Cache-Control", "no-cache, must-revalidate");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.json(manifest);
    } catch (error) {
        console.error("GetManifest error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

/**
 * GET /api/levels/manifest/custom-level
 * Returns manifest of custom levels for UE5 app sync.
 */
export const getCustomLevelManifest = async (
    req: Request,
    res: Response,
): Promise<void> => {
    await buildManifestResponse(req, res, false);
};

/**
 * GET /api/levels/manifest/main-menu
 * Returns manifest of main menu levels for UE5 app sync.
 */
export const getMainMenuManifest = async (
    req: Request,
    res: Response,
): Promise<void> => {
    await buildManifestResponse(req, res, true);
};
