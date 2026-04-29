/**
 * Migration: convert meta.created from locale en-US format to ISO 8601 UTC.
 * Run once after deploying the createLevel ISO fix.
 *
 * Usage: tsx scripts/migrate-created-to-iso.ts
 */
import dotenv from "dotenv";
import { connectDB } from "../src/config/db.js";
import { Level } from "../src/models/Level.js";

dotenv.config();

const isIsoFormat = (s: string): boolean => /^\d{4}-\d{2}-\d{2}T/.test(s);

const main = async () => {
    await connectDB();

    const levels = await Level.find({});
    console.log(`Found ${levels.length} levels to inspect.`);

    let converted = 0;
    let skipped = 0;
    let failed = 0;

    for (const lvl of levels) {
        const original = lvl.meta?.created;
        if (!original) {
            skipped++;
            continue;
        }
        if (isIsoFormat(original)) {
            skipped++;
            continue;
        }

        // Parse old format "MM/DD/YYYY, HH:mm AM/PM"
        const parsed = new Date(original);
        if (isNaN(parsed.getTime())) {
            // Fallback: use publishedAt if available
            if (lvl.publishedAt) {
                lvl.meta.created = lvl.publishedAt.toISOString();
                await lvl.save();
                converted++;
                console.log(
                    `Converted (fallback publishedAt): ${lvl.code} — "${original}" → "${lvl.meta.created}"`,
                );
            } else {
                console.warn(
                    `Failed to parse: "${original}" (level ${lvl.code})`,
                );
                failed++;
            }
            continue;
        }

        lvl.meta.created = parsed.toISOString();
        await lvl.save();
        converted++;
        console.log(
            `Converted: ${lvl.code} — "${original}" → "${lvl.meta.created}"`,
        );
    }

    console.log(
        `\nDone. Converted: ${converted}, Skipped: ${skipped}, Failed: ${failed}`,
    );
    process.exit(0);
};

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
