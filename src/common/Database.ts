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
 * Sanitizes a workspace path to be used as a directory name.
 * Replaces common path separators with underscores and removes potentially problematic characters.
 * @param fsPath The file system path of the workspace.
 * @returns A sanitized string suitable for a directory name.
 */
function sanitizeWorkspacePathForDirectoryName(fsPath: string): string {
  // Replace slashes and backslashes with underscores
  let sanitized = fsPath.replace(/[/]/g, '_');
  // Remove or replace other characters that might be problematic in directory names
  sanitized = sanitized.replace(/[^a-zA-Z0-9_.-]/g, ''); // Keep alphanumeric, underscore, dot, hyphen
  if (sanitized.startsWith('_')) {
    sanitized = sanitized.substring(1);
  }
  if (sanitized.endsWith('_')) {
    sanitized = sanitized.slice(0, -1);
  }
  // Ensure it's not empty
  return sanitized || 'default_workspace';
}

/**
 * Creates and initializes the database
 * @param context The extension context to access storage paths
 * @returns A promise that resolves to a database instance
 */
export async function createDatabase(context: vscode.ExtensionContext): Promise<TaskDb> {
  const lowdbModule = await import('lowdb');
  const nodeModule = await import('lowdb/node');

  const onDidChangeDataEmitter = new vscode.EventEmitter<void>();

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    throw new Error('No workspace folder found. Cannot create a workspace-specific database.');
  }
  const workspaceUri = workspaceFolders[0].uri;
  const sanitizedWorkspaceDirName = sanitizeWorkspacePathForDirectoryName(workspaceUri.fsPath);

  // Use the extension's global storage path
  const globalStorageUri = context.globalStorageUri;

  // Create a subdirectory for this specific workspace within the global storage
  const workspaceSpecificStorageDirUri = vscode.Uri.joinPath(globalStorageUri, sanitizedWorkspaceDirName);

  // Ensure the global storage directory and the workspace-specific subdirectory exist
  try {
    await vscode.workspace.fs.createDirectory(globalStorageUri);
    await vscode.workspace.fs.createDirectory(workspaceSpecificStorageDirUri);
  } catch {
    // It's possible the directory already exists, which is fine.
    // If there's another error, lowdb will likely fail later, providing a more specific message.
  }

  const dbFileUri = vscode.Uri.joinPath(workspaceSpecificStorageDirUri, 'tasks.json');
  const dbFilePath = dbFileUri.fsPath;

  const adapter = new nodeModule.JSONFile<ITaskDatabase>(dbFilePath);
  const lowDbInstance = new lowdbModule.Low<ITaskDatabase>(adapter, defaultDatabase);

  await lowDbInstance.read();

  if (!lowDbInstance.data) {
    lowDbInstance.data = defaultDatabase;
  } else {
    if (!Array.isArray(lowDbInstance.data.tasks)) {
      lowDbInstance.data.tasks = [];
    }
    if (typeof lowDbInstance.data.nextId !== 'number') {
      lowDbInstance.data.nextId = 1;
    }
  }

  await lowDbInstance.write();

  const taskDbInstance: TaskDb = {
    data: lowDbInstance.data,
    read: async () => {
      await lowDbInstance.read();
      taskDbInstance.data = lowDbInstance.data;
    },
    write: async () => {
      lowDbInstance.data = taskDbInstance.data;
      await lowDbInstance.write();
      onDidChangeDataEmitter.fire();
    },
    _onDidChangeData: onDidChangeDataEmitter,
    onDidChangeData: onDidChangeDataEmitter.event,
  };

  return taskDbInstance;
}
