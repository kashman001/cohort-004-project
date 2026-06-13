import { eq, and, inArray, sql } from "drizzle-orm";
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

export type RatingSummary = { average: number | null; count: number };

export function getCourseRatingSummary(courseId: number): RatingSummary {
  const row = db
    .select({
      average: sql<number | null>`avg(${courseRatings.stars})`,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(eq(courseRatings.courseId, courseId))
    .get();

  return { average: row?.average ?? null, count: row?.count ?? 0 };
}

export function getRatingSummariesForCourses(
  courseIds: number[]
): Map<number, RatingSummary> {
  const map = new Map<number, RatingSummary>();
  if (courseIds.length === 0) return map;

  const rows = db
    .select({
      courseId: courseRatings.courseId,
      average: sql<number | null>`avg(${courseRatings.stars})`,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(inArray(courseRatings.courseId, courseIds))
    .groupBy(courseRatings.courseId)
    .all();

  for (const row of rows) {
    map.set(row.courseId, {
      average: row.average ?? null,
      count: row.count ?? 0,
    });
  }
  return map;
}
