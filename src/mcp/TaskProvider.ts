// src/mcp/TaskProvider.ts
import * as vscode from 'vscode'; // Now needed for ExtensionContext
import { ITaskProvider } from './ITaskProvider';
import { ITask } from '../common/Task';
import { createDatabase, TaskDb } from '../common/Database';

/**
 * Implementation of ITaskProvider using LowDB for persistent storage.
 * Manages tasks for the extension.
 */
export class TaskProvider implements ITaskProvider {
  private db: TaskDb | null = null;
  private tasks: ITask[] = [];
  private nextId: number = 1;
  private initialized: boolean = false;

  /**
   * Sets the database instance for the TaskProvider.
   * This should be called before any other method that relies on the database.
   * @param db The TaskDb instance.
   */
  public async setDb(db: TaskDb): Promise<void> {
    this.db = db;
    // Assuming db.read() loads the data
    // If db.data is not immediately populated after createDatabase,
    // we might need to explicitly call read here or ensure createDatabase does it.
    // For now, let's assume createDatabase followed by db.read() in extension.ts is sufficient
    // and this.db.data will be populated.
    if (this.db && this.db.data) {
      this.tasks = this.db.data.tasks || [];
      this.nextId = this.db.data.nextId || 1;
      this.initialized = true;
    } else {
      // Fallback or error if db is not properly set up
      // This case should ideally be prevented by logic in activate
      this.tasks = [];
      this.nextId = 1;
      this.initialized = false; // Or throw an error
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
      // Already initialized with a DB via setDb
      return;
    }

    // This path is now less likely if setDb is called first from activate
    // However, keeping it as a fallback or for direct instantiation scenarios (e.g. tests not using setDb)
    // If db is already set, we trust it's been read.
    // If not, we try to create it.
    if (!this.db) {
      try {
        this.db = await createDatabase(context);
        // db.read() should have been called by createDatabase or immediately after in activate
        this.tasks = this.db.data.tasks || [];
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
        this.initialized = true; // Initialized, but with in-memory fallback
      }
    } else if (this.db.data) {
      // DB was set, ensure data is loaded
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
    this.tasks = [...tasks];
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
      this.db.data.tasks = this.tasks;
      this.db.data.nextId = this.nextId;
      await this.db.write();
    } catch {
      // We can't access context here, so just log silently (no user message)
      // This is ok since database saving should be transparent to the user
      // and errors would be detected when trying to load
    }
  }

  /**
   * Retrieves tasks.
   * - If `filter` is undefined, retrieves all tasks.
   * - If `filter.parentId` is a string, retrieves children of that parent.
   * - If `filter.parentId` is `null`, retrieves top-level tasks.
   * @param filter - Optional filter criteria.
   * @returns A promise that resolves to an array of tasks.
   */
  public async getTasks(filter?: { parentId?: string | null }): Promise<ITask[]> {
    this.ensureInitialized();

    if (filter === undefined) {
      return [...this.tasks]; // Return all tasks if no filter is provided
    }

    const parentId = filter.parentId;

    if (typeof parentId === 'string') {
      return this.tasks.filter((task) => task.parentId === parentId);
    } else {
      // Handles filter.parentId being null (or undefined if filter object was provided without parentId)
      return this.tasks.filter((task) => !task.parentId);
    }
  }

  /**
   * Retrieves a single task by its ID.
   * @param taskId - The ID of the task to retrieve.
   * @returns A promise that resolves to the task, or undefined if not found.
   */
  public async getTask(taskId: string): Promise<ITask | undefined> {
    this.ensureInitialized();

    return this.tasks.find((task) => task.id === taskId);
  }

  /**
   * Creates a new task.
   * @param taskData - The data for the new task.
   * @returns A promise that resolves to the created task.
   */
  public async createTask(taskData: {
    title: string;
    description?: string;
    parentId?: string | null;
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
      parentId: taskData.parentId === undefined ? null : taskData.parentId, // Store undefined as null
      order: taskData.order ?? 0,
    };
    this.tasks.push(newTask);
    await this.saveToDatabase();
    return newTask;
  }

  /**
   * Updates an existing task.
   * @param taskId - The ID of the task to update.
   * @param taskUpdate - The partial data to update the task with.
   * @returns A promise that resolves to the updated task, or undefined if not found.
   */
  public async updateTask(
    taskId: string,
    taskUpdate: Partial<Omit<ITask, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<ITask | undefined> {
    this.ensureInitialized();

    const taskIndex = this.tasks.findIndex((task) => task.id === taskId);
    if (taskIndex === -1) {
      return undefined;
    }

    const updatedTask = {
      ...this.tasks[taskIndex],
      ...taskUpdate,
      updatedAt: new Date(),
    };
    this.tasks[taskIndex] = updatedTask;
    await this.saveToDatabase();
    return updatedTask;
  }

  /**
   * Deletes a task.
   * @param taskId - The ID of the task to delete.
   * @returns A promise that resolves to true if deletion was successful, false otherwise.
   */
  public async deleteTask(taskId: string): Promise<boolean> {
    this.ensureInitialized();

    const taskIndex = this.tasks.findIndex((task) => task.id === taskId);
    if (taskIndex === -1) {
      return false;
    }

    // Collect all descendant IDs to delete
    const idsToDelete = new Set<string>();
    idsToDelete.add(taskId);

    const findChildrenRecursive = (currentParentId: string) => {
      const children = this.tasks.filter((task) => task.parentId === currentParentId);
      for (const child of children) {
        idsToDelete.add(child.id);
        findChildrenRecursive(child.id);
      }
    };

    findChildrenRecursive(taskId);

    // Filter out the tasks to be deleted
    this.tasks = this.tasks.filter((task) => !idsToDelete.has(task.id));
    await this.saveToDatabase();

    return true;
  }

  /**
   * Deletes all completed tasks.
   * @returns A promise that resolves to the number of tasks deleted.
   */
  public async deleteCompletedTasks(): Promise<number> {
    this.ensureInitialized();

    const completedTasks = this.tasks.filter((task) => task.completed);
    const numberOfCompletedTasks = completedTasks.length;

    if (numberOfCompletedTasks === 0) {
      return 0;
    }

    this.tasks = this.tasks.filter((task) => !task.completed);
    await this.saveToDatabase();

    return numberOfCompletedTasks;
  }
}
