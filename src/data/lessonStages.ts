/**
 * The guided lesson's stages: one per day of the plan (DEC-006, DEC-028).
 *
 * The one canonical list of "lesson stages". Every "stage N", the landing
 * hero's next stop, `stagesTaught` in progress, the achievements and the
 * session result's "Lesson N" count over this list, so none of them can
 * disagree about where a learner is.
 *
 * Read from `CURRICULUM` rather than from `LEARNING_STAGES`, which stays the
 * four letter layers of the tree that the practice pools count in. The plan
 * splits the two widest layers in half and ends with the digits, so a lesson
 * stage is something one sitting can finish, and "stage 3" and "day 3" are the
 * same characters on every page.
 *
 * Lives in the data layer so storage and game logic can read it without
 * importing a component module.
 */

import { CURRICULUM } from './curriculum'

export const LESSON_STAGES: readonly (readonly string[])[] = CURRICULUM.map((day) => day.characters)
