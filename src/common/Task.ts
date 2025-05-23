// src/common/Task.ts

/**
 * Represents a single task item.
 */
export interface ITask {
  /**
   * Unique identifier for the task.
   */
  id: string;

  /**
   * The main title or summary of the task.
   */
  title: string;

  /**
   * A more detailed description of the task.
   * Optional.
   */
  description?: string;

  /**
   * Indicates whether the task has been completed.
   */
  completed: boolean;

  /**
   * The date and time when the task was created.
   */
  createdAt: Date;

  /**
   * The date and time when the task was last updated.
   */
  updatedAt: Date;

  /**
   * The order of this task relative to its siblings (tasks with the same parent).
   * Lower numbers indicate higher priority or earlier sequence.
   */
  order: number;

  /**
   * An array of child tasks.
   */
  children: ITask[];

  /**
   * The ID of the parent task, if this is a sub-task.
   * null or undefined if it's a top-level task.
   */
  parentId?: string | null;
}
