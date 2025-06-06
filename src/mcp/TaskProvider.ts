// src/mcp/TaskProvider.ts
import * as vscode from 'vscode'; // Now needed for ExtensionContext
import { ITaskProvider } from './ITaskProvider';
import { ITask } from '../common/Task';
import { createDatabase, TaskDb } from '../common/Database';

/**
 * Implementation of ITaskProvider using a JSON file for persistent storage.
 * Manages tasks for the extension, supporting a hierarchical structure.
 */
export class TaskProvider implements ITaskProvider {
  private db: TaskDb | null = null;
  private tasks: ITask[] = []; // Stores top-level tasks; subtasks are in parent's 'children'
  private nextId: number = 1;
  private initialized: boolean = false;

  /**
   * Sets the database instance for the TaskProvider.
   * This should be called before any other method that relies on the database.
   * @param db The TaskDb instance.
   */
  public async setDb(db: TaskDb): Promise<void> {
    this.db = db;
    if (this.db && this.db.data) {
      // Assumes db.data.tasks is already in the hierarchical ITask[] structure
      this.tasks = this.db.data.tasks || [];
      this.nextId = this.db.data.nextId || 1;
      this.initialized = true;
    } else {
      this.tasks = [];
      this.nextId = 1;
      this.initialized = false;
      if (vscode.workspace.getConfiguration().get('copilotTaskMaster.debugMode')) {
        vscode.window.showErrorMessage('TaskProvider: Database not properly configured via setDb.');
      }
    }
  }

  /**
   * Initializes the TaskProvider.
   * Ensures that the database is loaded and ready for use.
   * @param context The extension context.
   */
  public async initialize(context: vscode.ExtensionContext): Promise<void> {
    if (this.initialized && this.db) {
      return;
    }
    if (!this.db) {
      try {
        this.db = await createDatabase(context);
        this.tasks = this.db.data.tasks || []; // Assumes hierarchical structure
        this.nextId = this.db.data.nextId || 1;
        this.initialized = true;
        if (context.extensionMode === vscode.ExtensionMode.Development) {
          vscode.window.showInformationMessage(
            'TaskProvider: Database initialized successfully via fallback in initialize().',
          );
        }
      } catch (error) {
        if (context.extensionMode === vscode.ExtensionMode.Development) {
          vscode.window.showErrorMessage(
            `TaskProvider: Failed to initialize database via fallback - ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        this.tasks = [];
        this.nextId = 1;
        this.initialized = true; 
      }
    } else if (this.db.data) {
      this.tasks = this.db.data.tasks || [];
      this.nextId = this.db.data.nextId || 1;
      this.initialized = true;
    }
  }

  /**
   * Initializes the TaskProvider specifically for testing.
   * This bypasses the need for a real ExtensionContext.
   * @param tasks Initial tasks to populate the provider with
   * @param nextId The next ID to use for task creation
   */
  public initializeForTesting(tasks: ITask[] = [], nextId: number = 1): void {
    // Assumes 'tasks' provided are already in the hierarchical ITask structure
    this.tasks = JSON.parse(JSON.stringify(tasks)); // Deep copy
    this.nextId = nextId;
    this.initialized = true;
  }

  /**
   * Ensures the provider is initialized before performing operations
   * @private
   * @throws Error if the provider isn't initialized and has no fallback data
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new Error(
        'TaskProvider is not initialized or database is not set. Call setDb() and/or initialize() first.',
      );
    }
  }

  /**
   * Saves the current state to the database
   * @private
   */
  private async saveToDatabase(): Promise<void> {
    if (!this.db) {
      return;
    }
    try {
      // this.tasks already holds the hierarchical structure
      this.db.data.tasks = this.tasks;
      this.db.data.nextId = this.nextId;
      await this.db.write();
    } catch (error) {
        if (vscode.workspace.getConfiguration().get('copilotTaskMaster.debugMode')) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`TaskProvider: Failed to save to database - ${message}`);
        }
    }
  }

  // Recursive helper to find a task by ID
  private findTaskByIdRecursive(tasksToSearch: ITask[], id: string): ITask | undefined {
    for (const task of tasksToSearch) {
      if (task.id === id) {
        return task;
      }
      if (task.children && task.children.length > 0) {
        const foundInChild = this.findTaskByIdRecursive(task.children, id);
        if (foundInChild) {
          return foundInChild;
        }
      }
    }
    return undefined;
  }

  /**
   * Retrieves all top-level tasks.
   * To get children of a specific task, retrieve the parent task first and then access its 'children' property.
   * @returns A promise that resolves to an array of top-level tasks.
   */
  public async getTasks(): Promise<ITask[]> {
    this.ensureInitialized();
    return JSON.parse(JSON.stringify(this.tasks)); // Return a deep copy of top-level tasks
  }

  /**
   * Retrieves a single task by its ID, searching recursively.
   * @param taskId - The ID of the task to retrieve.
   * @returns A promise that resolves to the task, or undefined if not found.
   */
  public async getTask(taskId: string): Promise<ITask | undefined> {
    this.ensureInitialized();
    const task = this.findTaskByIdRecursive(this.tasks, taskId);
    return task ? JSON.parse(JSON.stringify(task)) : undefined; // Return a deep copy
  }

  /**
   * Creates a new task.
   * If parentId is provided, the task is created as a subtask. Otherwise, it's a top-level task.
   * @param taskData - The data for the new task, including an optional parentId.
   * @returns A promise that resolves to the created task.
   * @throws Error if parentId is provided but the parent task is not found.
   */
  public async createTask(taskData: {
    title: string;
    description?: string;
    parentId?: string | null; // ID of the parent task
    order?: number;
  }): Promise<ITask> {
    this.ensureInitialized();

    const newTask: ITask = {
      id: (this.nextId++).toString(),
      title: taskData.title,
      description: taskData.description,
      completed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      order: taskData.order ?? 0,
      children: [], // Initialize with an empty children array
    };

    if (taskData.parentId) {
      const parentTask = this.findTaskByIdRecursive(this.tasks, taskData.parentId);
      if (parentTask) {
        parentTask.children.push(newTask);
      } else {
        throw new Error(`Parent task with ID ${taskData.parentId} not found.`);
      }
    } else {
      this.tasks.push(newTask);
    }

    await this.saveToDatabase();
    return JSON.parse(JSON.stringify(newTask)); // Return a deep copy
  }

  /**
   * Updates an existing task.
   * @param taskId - The ID of the task to update.
   * @param taskUpdate - The partial data to update the task with.
   *                     Cannot update 'id', 'createdAt', 'updatedAt', or 'children' directly.
   * @returns A promise that resolves to the updated task, or undefined if not found.
   */
  public async updateTask(
    taskId: string,
    taskUpdate: Partial<Omit<ITask, 'id' | 'createdAt' | 'updatedAt' | 'children'>>,
  ): Promise<ITask | undefined> {
    this.ensureInitialized();

    const task = this.findTaskByIdRecursive(this.tasks, taskId);
    if (!task) {
      return undefined;
    }

    Object.assign(task, taskUpdate, { updatedAt: new Date() });
    
    await this.saveToDatabase();
    return JSON.parse(JSON.stringify(task)); // Return a deep copy
  }

  // Recursive helper to remove a task by ID from a given list of tasks
  private removeTaskRecursive(tasksList: ITask[], idToDelete: string): boolean {
    for (let i = 0; i < tasksList.length; i++) {
      if (tasksList[i].id === idToDelete) {
        tasksList.splice(i, 1); // Remove the task
        return true; // Task found and removed
      }
      if (tasksList[i].children && tasksList[i].children.length > 0) {
        if (this.removeTaskRecursive(tasksList[i].children, idToDelete)) {
          return true; // Task found and removed in a nested list
        }
      }
    }
    return false; // Task not found in this list or its children
  }

  /**
   * Deletes a task and all its descendants.
   * @param taskId - The ID of the task to delete.
   * @returns A promise that resolves to true if deletion was successful, false otherwise.
   */
  public async deleteTask(taskId: string): Promise<boolean> {
    this.ensureInitialized();
    const deleted = this.removeTaskRecursive(this.tasks, taskId);
    if (deleted) {
      await this.saveToDatabase();
    }
    return deleted;
  }
  
  // Recursive helper to filter out completed tasks
  // If a parent task is completed, it and its entire subtree are removed.
  private filterCompletedTasksRecursive(tasksToFilter: ITask[]): ITask[] {
    const remainingTasks: ITask[] = [];
    for (const task of tasksToFilter) {
      if (!task.completed) {
        // Task is not completed, keep it
        const filteredChildren = task.children ? this.filterCompletedTasksRecursive(task.children) : [];
        remainingTasks.push({ ...task, children: filteredChildren });
      }
      // If task.completed is true, it's excluded, along with all its children.
    }
    return remainingTasks;
  }

  // Recursive helper to count tasks marked as completed.
  private countCompletedTasksRecursive(tasksToCount: ITask[]): number {
    let count = 0;
    for (const task of tasksToCount) {
      if (task.completed) {
        count++;
      }
      // Only count children if the parent itself is not completed but might have completed children
      // However, our filter logic removes the whole branch if parent is completed.
      // So, we count completed ones before filtering.
      if (task.children && task.children.length > 0) {
         // This will double count if parent and child are both complete,
         // but we are interested in how many *individual* tasks are complete.
        count += this.countCompletedTasksRecursive(task.children);
      }
    }
    return count;
  }


  /**
   * Deletes all tasks that are marked as completed.
   * If a parent task is completed, it and all its descendants are removed.
   * @returns A promise that resolves to the number of tasks that were actually marked as completed and then deleted.
   */
  public async deleteCompletedTasks(): Promise<number> {
    this.ensureInitialized();

    // First, count how many tasks are actually marked as completed.
    // This needs to traverse the tree and sum up all tasks where task.completed is true.
    const initialCompletedCount = this.countTotalCompletedTasksRecursive(this.tasks);

    if (initialCompletedCount === 0) {
      return 0;
    }
    
    // Filter out completed tasks. If a parent is completed, it and its children are removed.
    this.tasks = this.filterCompletedTasksRecursive(this.tasks);
    await this.saveToDatabase();

    // The number of deleted tasks is the count of those that were 'completed: true'.
    return initialCompletedCount;
  }

  // Helper to accurately count tasks that are 'completed: true' throughout the tree.
  private countTotalCompletedTasksRecursive(tasks: ITask[]): number {
    let count = 0;
    for (const task of tasks) {
        if (task.completed) {
            count++;
        }
        if (task.children && task.children.length > 0) {
            count += this.countTotalCompletedTasksRecursive(task.children);
        }
    }
    return count;
  }
}
