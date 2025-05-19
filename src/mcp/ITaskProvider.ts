// src/mcp/ITaskProvider.ts
import { ITask } from '../common/Task'; // Import ITask

/**
 * Interface for a Model Context Protocol (MCP) provider
 * that manages tasks.
 */
export interface ITaskProvider {
  /**
   * Retrieves tasks, optionally filtered.
   * @param filter - Optional filter criteria.
   *                 - If `filter.parentId` is a string, retrieves children of that parent.
   *                 - If `filter.parentId` is `null` or `undefined`, or if `filter` is `undefined`,
   *                   retrieves top-level tasks.
   * @returns A promise that resolves to an array of tasks.
   */
  getTasks(filter?: { parentId?: string | null }): Promise<ITask[]>; // Updated signature

  /**
   * Retrieves a single task by its ID.
   * @param taskId - The ID of the task to retrieve.
   * @returns A promise that resolves to the task, or undefined if not found.
   */
  getTask(taskId: string): Promise<ITask | undefined>;

  /**
   * Creates a new task.
   * @param taskData - The data for the new task.
   *                     Should include title, and optionally parentId, description, order.
   * @returns A promise that resolves to the created task.
   */
  createTask(taskData: {
    title: string;
    description?: string;
    parentId?: string | null;
    order?: number;
  }): Promise<ITask>; // Allow parentId to be null

  /**
   * Updates an existing task.
   * @param taskId - The ID of the task to update.
   * @param taskUpdate - The partial data to update the task with.
   * @returns A promise that resolves to the updated task, or undefined if not found.
   */
  updateTask(
    taskId: string,
    taskUpdate: Partial<Omit<ITask, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<ITask | undefined>; // Changed to ITask | undefined

  /**
   * Deletes a task.
   * @param taskId - The ID of the task to delete.
   * @returns A promise that resolves to true if deletion was successful, false otherwise.
   */
  deleteTask(taskId: string): Promise<boolean>;

  /**
   * Deletes all completed tasks.
   * @returns A promise that resolves to the number of tasks deleted.
   */
  deleteCompletedTasks(): Promise<number>;
}
