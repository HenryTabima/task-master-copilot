// src/common/Database.ts
import { ITask } from './Task';
import * as vscode from 'vscode';

/**
 * Interface representing the LowDB schema
 */
export interface ITaskDatabase {
  /**
   * Array of tasks
   */
  tasks: ITask[];
  /**
   * Next available ID for task creation
   */
  nextId: number;
}

/**
 * Default database structure with empty tasks array and initial nextId
 */
export const defaultDatabase: ITaskDatabase = {
  tasks: [],
  nextId: 1,
};

/**
 * Type representing a LowDB database with our schema
 */
export type TaskDb = {
  data: ITaskDatabase;
  read: () => Promise<void>;
  write: () => Promise<void>;
  /**
   * Event emitter for database changes.
   */
  _onDidChangeData: vscode.EventEmitter<void>;
  /**
   * Public event for database changes.
   */
  onDidChangeData: vscode.Event<void>;
};

/**
 * Creates and initializes the database
 * @param context The extension context to access storage paths
 * @returns A promise that resolves to a database instance
 */
export async function createDatabase(context: vscode.ExtensionContext): Promise<TaskDb> {
  // Dynamically import lowdb (ESM module)
  const lowdbModule = await import('lowdb');
  const nodeModule = await import('lowdb/node');

  const onDidChangeDataEmitter = new vscode.EventEmitter<void>();

  // Get the extension's global storage path
  const storageDirUri = context.globalStorageUri;
  const dbFileUri = vscode.Uri.joinPath(storageDirUri, 'tasks-db.json');
  const dbFilePath = dbFileUri.fsPath;

  // Ensure the global storage directory exists
  try {
    await vscode.workspace.fs.createDirectory(storageDirUri);
  } catch {
    // If directory creation fails, lowdb will likely fail during adapter instantiation or write.
    // No explicit error handling here to avoid linting issues with console.error
    // and to let the subsequent operations signal the failure.
  }

  // Create a JSON file adapter
  const adapter = new nodeModule.JSONFile<ITaskDatabase>(dbFilePath);

  // Create the database instance
  const lowDbInstance = new lowdbModule.Low<ITaskDatabase>(adapter, defaultDatabase);

  // Load data from the file or use default if file doesn't exist
  await lowDbInstance.read();

  // Ensure the database structure conforms to the expected schema
  if (!lowDbInstance.data) {
    lowDbInstance.data = defaultDatabase;
  } else {
    // Make sure the structure is valid
    if (!Array.isArray(lowDbInstance.data.tasks)) {
      lowDbInstance.data.tasks = [];
    }
    if (typeof lowDbInstance.data.nextId !== 'number') {
      lowDbInstance.data.nextId = 1;
    }
  }

  // Save the initialized database
  await lowDbInstance.write();

  const taskDbInstance: TaskDb = {
    data: lowDbInstance.data,
    read: async () => {
      await lowDbInstance.read();
      // Ensure data is synchronized after read
      taskDbInstance.data = lowDbInstance.data;
    },
    write: async () => {
      // Ensure data is synchronized before write
      lowDbInstance.data = taskDbInstance.data;
      await lowDbInstance.write();
      onDidChangeDataEmitter.fire(); // Fire event after successful write
    },
    _onDidChangeData: onDidChangeDataEmitter,
    onDidChangeData: onDidChangeDataEmitter.event,
  };

  return taskDbInstance;
}
