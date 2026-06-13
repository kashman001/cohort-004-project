import { eq, and } from "drizzle-orm";
import { db } from "~/db";
import { courseRatings } from "~/db/schema";
import { isUserEnrolled } from "./enrollmentService";

// ─── Rating Service ───
// Handles course star ratings: submit (upsert), read a user's rating,
// and live AVG/COUNT aggregates. Uses positional parameters (project convention).

export function submitRating(userId: number, courseId: number, stars: number) {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    throw new Error("Rating must be a whole number between 1 and 5");
  }

  if (!isUserEnrolled(userId, courseId)) {
    throw new Error("Only enrolled students can rate this course");
  }

  return db
    .insert(courseRatings)
    .values({ userId, courseId, stars })
    .onConflictDoUpdate({
      target: [courseRatings.userId, courseRatings.courseId],
      set: { stars, updatedAt: new Date().toISOString() },
    })
    .returning()
    .get();
}

export function getUserRating(userId: number, courseId: number): number | null {
  const row = db
    .select({ stars: courseRatings.stars })
    .from(courseRatings)
    .where(
      and(
        eq(courseRatings.userId, userId),
        eq(courseRatings.courseId, courseId)
      )
    )
    .get();

  return row?.stars ?? null;
}
