import * as vscode from 'vscode';
import { ITaskProvider } from '../mcp/ITaskProvider';

/**
 * Defines the structure for a single operation within the OperationTasksTool.
 */
export interface ITaskOperation {
  action: 'add' | 'toggleComplete' | 'delete' | 'add-subtask';
  taskId?: string;
  taskTitle?: string;
  taskDescription?: string;
  parentId?: string;
  taskStatus?: boolean;
  childTasks?: ITaskOperation[];
}

/**
 * Defines the structure of the arguments for the OperationTasksTool.
 */
interface IOperationTasksToolArgs {
  operations: ITaskOperation[];
}

/**
 * Represents a tool that performs batch operations on tasks.
 */
export class OperationTasksTool implements vscode.LanguageModelTool<IOperationTasksToolArgs> {
  public readonly name = 'operationTaskTool';
  public readonly description = 'Performs batch operations on tasks, such as adding, deleting, or updating multiple tasks at once.';
  public readonly toolReferenceName = 'operationTasks';

  private taskProvider: ITaskProvider;

  constructor(taskProvider: ITaskProvider) {
    this.taskProvider = taskProvider;
  }

  public async invoke(
    options: vscode.LanguageModelToolInvocationOptions<IOperationTasksToolArgs>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const { operations } = options.input;
    const results: string[] = [];

    if (token.isCancellationRequested) {
      throw new vscode.LanguageModelError('Batch operations cancelled by user.');
    }

    if (!operations || operations.length === 0) {
      throw new vscode.LanguageModelError('Error: No operations provided for batch processing.');
    }

    try {
      for (const operation of operations) {
        if (token.isCancellationRequested) {
          results.push('Operation cancelled by user during batch processing.');
          break;
        }
        await this.processOperation(operation, results, token);
      }
      const resultMessage = results.join('\n') || 'Batch operations completed with no specific messages.';
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(resultMessage)]);
    } catch (error) {
      if (error instanceof vscode.LanguageModelError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new vscode.LanguageModelError(`Error during batch operations: ${errorMessage}`);
    }
  }

  private async processOperation(operation: ITaskOperation, results: string[], token: vscode.CancellationToken, parentIdForAddSubtask?: string): Promise<void> {
    if (token.isCancellationRequested) {
      results.push(`Skipping operation due to cancellation: ${operation.action} ${operation.taskTitle || operation.taskId || ''}`);
      return;
    }
    switch (operation.action) {
      case 'add':
        if (operation.parentId) {
          results.push(`Error (add): 'parentId' should not be provided for 'add' action. Use 'add-subtask' for subtasks. Task "${operation.taskTitle || 'Untitled'}" not added.`);
          return;
        }
        if (!operation.taskTitle) {
          results.push('Error (add): taskTitle is required for "add" action.');
          return;
        }
        try {
          const newTaskData = {
            title: operation.taskTitle,
            description: operation.taskDescription,
            parentId: parentIdForAddSubtask, // Will be undefined for top-level 'add'
            // order: undefined, // ITaskProvider.createTask can take an order, but it's not in ITaskOperation yet
          };
          const addedTask = await this.taskProvider.createTask(newTaskData);
          // Handle operation.taskStatus if needed, ITaskProvider.createTask doesn't take completed status
          // It might require an additional updateTask call if status needs to be set immediately.
          if (typeof operation.taskStatus === 'boolean' && addedTask.completed !== operation.taskStatus) {
            await this.taskProvider.updateTask(addedTask.id, { completed: operation.taskStatus });
            results.push(`Task "${addedTask.title}" (ID: ${addedTask.id}) added successfully and status set to ${operation.taskStatus}.`);
          } else {
            results.push(`Task "${addedTask.title}" (ID: ${addedTask.id}) added successfully.`);
          }

          if (operation.childTasks && operation.childTasks.length > 0) {
            results.push(`Processing child tasks for "${addedTask.title}"...`);
            for (const childOp of operation.childTasks) {
              if (token.isCancellationRequested) {
                results.push('Child task processing cancelled.');
                break;
              }
              if (childOp.action === 'add') {
                await this.processOperation({ ...childOp, action: 'add-subtask', parentId: addedTask.id }, results, token);
              } else {
                 results.push(`Error (add child): Invalid action '${childOp.action}' for child task of "${addedTask.title}". Only 'add' (interpreted as add-subtask) is supported for inline children.`);
              }
            }
          }
        } catch (e) {
          results.push(`Error adding task "${operation.taskTitle}": ${e instanceof Error ? e.message : String(e)}`);
        }
        break;

      case 'add-subtask':
        if (!operation.parentId) {
          results.push(`Error (add-subtask): 'parentId' is required for 'add-subtask' action. Task "${operation.taskTitle || 'Untitled'}" not added.`);
          return;
        }
        if (operation.childTasks && operation.childTasks.length > 0) {
          results.push(`Error (add-subtask): 'childTasks' should not be provided for 'add-subtask' action. Task "${operation.taskTitle || 'Untitled'}" not added.`);
          return;
        }
        if (!operation.taskTitle) {
          results.push('Error (add-subtask): taskTitle is required for "add-subtask" action.');
          return;
        }
        try {
          const subTaskData = {
            title: operation.taskTitle,
            description: operation.taskDescription,
            parentId: operation.parentId,
            // order: undefined, // Similarly, order could be added to ITaskOperation
          };
          const addedSubtask = await this.taskProvider.createTask(subTaskData);
          if (typeof operation.taskStatus === 'boolean' && addedSubtask.completed !== operation.taskStatus) {
            await this.taskProvider.updateTask(addedSubtask.id, { completed: operation.taskStatus });
            results.push(`Subtask "${addedSubtask.title}" (ID: ${addedSubtask.id}) added successfully to parent "${operation.parentId}" and status set to ${operation.taskStatus}.`);
          } else {
            results.push(`Subtask "${addedSubtask.title}" (ID: ${addedSubtask.id}) added successfully to parent "${operation.parentId}".`);
          }
        } catch (e) {
          results.push(`Error adding subtask "${operation.taskTitle}" to parent "${operation.parentId}": ${e instanceof Error ? e.message : String(e)}`);
        }
        break;

      case 'toggleComplete':
        if (!operation.taskId) {
          results.push('Error (toggleComplete): taskId is required.');
          return;
        }
        try {
          const task = await this.taskProvider.getTask(operation.taskId);
          if (!task) {
            results.push(`Error (toggleComplete): Task with ID "${operation.taskId}" not found.`);
            return;
          }
          const newStatus = typeof operation.taskStatus === 'boolean' ? operation.taskStatus : !task.completed;
          await this.taskProvider.updateTask(operation.taskId, { completed: newStatus });
          results.push(`Task "${task.title}" (ID: ${operation.taskId}) marked as ${newStatus ? 'complete' : 'incomplete'}.`);
        } catch (e) {
          results.push(`Error toggling task "${operation.taskId}": ${e instanceof Error ? e.message : String(e)}`);
        }
        break;

      case 'delete':
        if (!operation.taskId) {
          results.push('Error (delete): taskId is required.');
          return;
        }
        try {
          await this.taskProvider.deleteTask(operation.taskId);
          results.push(`Task with ID "${operation.taskId}" deleted successfully.`);
        } catch (e) {
          results.push(`Error deleting task "${operation.taskId}": ${e instanceof Error ? e.message : String(e)}`);
        }
        break;

      default: {
        const _exhaustiveCheck: never = operation.action;
        results.push(`Error: Unknown operation action: ${_exhaustiveCheck}`);
        break;
      }
    }
  }
}
