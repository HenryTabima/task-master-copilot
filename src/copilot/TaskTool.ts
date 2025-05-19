import * as vscode from 'vscode';
import { ITask } from '../common/Task';
import { ITaskProvider } from '../mcp/ITaskProvider';

/**
 * Represents a single operation within a batch request.
 */
interface ITaskOperation {
  action: 'add' | 'toggleComplete' | 'delete';
  taskId?: string;
  taskTitle?: string;
  taskDescription?: string;
  parentId?: string;
  taskStatus?: boolean;
}

/**
 * Payload for batch task operations.
 */
interface IBatchTaskPayload {
  operations: ITaskOperation[];
}

/**
 * Interface for the input parameters of the Task Manager tool.
 */
interface ITaskToolInput {
  operation: 'list' | 'add' | 'toggleComplete' | 'deleteCompleted' | 'batch';
  taskId?: string;
  taskTitle?: string;
  taskDescription?: string;
  parentId?: string;
  taskStatus?: boolean;
  batchPayload?: IBatchTaskPayload;
}

/**
 * Implements the LanguageModelTool for managing tasks via Copilot.
 */
export class TaskTool implements vscode.LanguageModelTool<ITaskToolInput> {
  private taskProvider: ITaskProvider;
  public readonly name = 'task_manager_tool';
  public readonly description = 'Manages tasks within VS Code. Allows listing, adding, and completing tasks.';

  constructor(taskProvider: ITaskProvider) {
    this.taskProvider = taskProvider;
  }

  /**
   * Prepares the invocation of the tool.
   * @param options The options for preparing the invocation.
   * @param _token A cancellation token.
   * @returns A promise that resolves to the prepared invocation options or undefined.
   */
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ITaskToolInput>,
    // _token: vscode.CancellationToken // _token indicates it might not be used
  ): Promise<vscode.PreparedToolInvocation | undefined> {
    const { input } = options;
    let title = 'Task Manager';
    let message = '';

    switch (input.operation) {
      case 'list':
        title = 'List Tasks';
        message = 'List all current tasks?';
        break;
      case 'add': {
        title = input.parentId ? 'Add Subtask' : 'Add Task';
        if (!input.taskTitle) {
          throw new vscode.LanguageModelError('Task title is required to add a task.');
        }
        // Ensure quotes in titles/descriptions are escaped for the Markdown message
        const escapedTitle = input.taskTitle.replace(/"/g, '\\"');
        const escapedDescription = input.taskDescription ? input.taskDescription.replace(/"/g, '\\"') : '';
        const escapedParentId = input.parentId ? input.parentId.replace(/"/g, '\\"') : '';

        message = `Add a new ${input.parentId ? 'subtask' : 'task'} titled "${escapedTitle}"?`;
        if (input.taskDescription) {
          message += ` With description: "${escapedDescription}"`;
        }
        if (input.parentId) {
          message += ` As a subtask of task ID "${escapedParentId}"`;
        }
        break;
      }
      case 'toggleComplete': {
        title = 'Toggle Task Status';
        if (!input.taskId) {
          throw new vscode.LanguageModelError('Task ID is required to toggle task status.');
        }
        // Escape taskId for Markdown
        const escapedTaskId = input.taskId.replace(/"/g, '"'); // Removed unnecessary escape
        if (typeof input.taskStatus === 'boolean') {
          message = `Mark task with ID "${escapedTaskId}" as ${input.taskStatus ? 'complete' : 'incomplete'}?`;
        } else {
          message = `Toggle completion status of task with ID "${escapedTaskId}"?`;
        }
        break;
      }
      case 'deleteCompleted':
        title = 'Delete Completed Tasks';
        message = 'Are you sure you want to delete all completed tasks?';
        break;
      case 'batch':
        title = 'Batch Task Operations';
        if (!input.batchPayload || input.batchPayload.operations.length === 0) {
          throw new vscode.LanguageModelError('Batch payload with at least one operation is required.');
        }
        message = `Perform ${input.batchPayload.operations.length} task operations in batch?`;
        break;
      default: {
        const _exhaustiveCheck: never = input.operation;
        throw new vscode.LanguageModelError(
          'Internal error: Unhandled operation type in prepareInvocation: ' + _exhaustiveCheck,
        );
      }
    }

    return {
      confirmationMessages: {
        title: title,
        message: new vscode.MarkdownString(message),
      },
    } as vscode.PreparedToolInvocation;
  }

  /**
   * Invokes the tool with the given options.
   * @param options The options for invoking the tool.
   * @param token A cancellation token.
   * @returns A promise that resolves to the tool's result.
   */
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ITaskToolInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const { input } = options;

    if (token.isCancellationRequested) {
      throw new vscode.LanguageModelError('Task operation cancelled by user.');
    }

    try {
      switch (input.operation) {
        case 'list': {
          if (token.isCancellationRequested) {
            throw new vscode.LanguageModelError('Task listing cancelled.');
          }

          const tasks: ITask[] = await this.taskProvider.getTasks();
          const taskList = tasks
            .map(
              (task: ITask) =>
                `ID: ${task.id}, Title: ${task.title}, Completed: ${task.completed}, Order: ${task.order}`,
            )
            .join('\n');

          return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(taskList || 'No tasks found.')]);
        }
        case 'add': {
          if (!input.taskTitle) {
            throw new vscode.LanguageModelError('Task title is required for the add operation.');
          }
          if (token.isCancellationRequested) {
            throw new vscode.LanguageModelError('Task addition cancelled.');
          }

          const taskData: Partial<ITask> = {
            title: input.taskTitle,
            description: input.taskDescription || '',
          };
          if (input.parentId) {
            taskData.parentId = input.parentId;
          }

          const newTask = await this.taskProvider.createTask(taskData as Omit<ITask, 'id' | 'completed' | 'order'>);

          if (token.isCancellationRequested) {
            // Note: TaskProvider already saved it. This cancellation is post-operation.
            throw new vscode.LanguageModelError('Task addition cancelled, but task was saved.');
          }
          return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(`Task added with ID: ${newTask.id}`),
          ]);
        }
        case 'toggleComplete': {
          if (!input.taskId) {
            throw new vscode.LanguageModelError('Task ID is required for the toggleComplete operation.');
          }
          if (token.isCancellationRequested) {
            throw new vscode.LanguageModelError('Task status toggle cancelled.');
          }

          let newCompletedStatus: boolean;
          let actionMessage: string;

          if (typeof input.taskStatus === 'boolean') {
            newCompletedStatus = input.taskStatus;
            actionMessage = `Task ${input.taskId} marked as ${newCompletedStatus ? 'complete' : 'incomplete'}.`;
          } else {
            const currentTask = await this.taskProvider.getTask(input.taskId);
            if (!currentTask) {
              throw new vscode.LanguageModelError(`Task with ID "${input.taskId.replace(/"/g, '"')}" not found.`); // Removed unnecessary escape
            }
            newCompletedStatus = !currentTask.completed;
            actionMessage = `Task ${input.taskId} status toggled to ${newCompletedStatus ? 'complete' : 'incomplete'}.`;
          }

          const updatedTask = await this.taskProvider.updateTask(input.taskId, { completed: newCompletedStatus });

          if (!updatedTask) {
            throw new vscode.LanguageModelError(
              `Task with ID "${input.taskId.replace(/"/g, '"')}" not found or failed to update.`,
            ); // Removed unnecessary escape
          }

          if (token.isCancellationRequested) {
            throw new vscode.LanguageModelError('Task status toggle cancelled, but task was updated.');
          }
          return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(actionMessage)]);
        }
        case 'deleteCompleted': {
          if (token.isCancellationRequested) {
            throw new vscode.LanguageModelError('Delete completed tasks cancelled.');
          }

          const numberOfDeletedTasks = await this.taskProvider.deleteCompletedTasks();

          if (token.isCancellationRequested) {
            // Note: TaskProvider already saved it. This cancellation is post-operation.
            throw new vscode.LanguageModelError('Delete completed tasks cancelled, but tasks were deleted.');
          }

          let resultMessage = 'No completed tasks found to delete.';
          if (numberOfDeletedTasks > 0) {
            resultMessage = `Successfully deleted ${numberOfDeletedTasks} completed task(s).`;
          }

          return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(resultMessage)]);
        }
        case 'batch': {
          if (!input.batchPayload) {
            throw new vscode.LanguageModelError('Batch payload is required for batch operation.');
          }
          if (token.isCancellationRequested) {
            throw new vscode.LanguageModelError('Batch task operation cancelled by user.');
          }

          const results: string[] = [];
          for (const op of input.batchPayload.operations) {
            if (token.isCancellationRequested) {
              results.push(`Operation cancelled before processing: ${op.action} ${op.taskId || op.taskTitle}`);
              break;
            }
            try {
              switch (op.action) {
                case 'add': {
                  if (!op.taskTitle) {
                    throw new Error('Task title is required for add operation in batch.');
                  }
                  const taskData: Partial<ITask> = {
                    title: op.taskTitle,
                    description: op.taskDescription || '',
                  };
                  if (op.parentId) {
                    taskData.parentId = op.parentId;
                  }
                  const newTask = await this.taskProvider.createTask(
                    taskData as Omit<ITask, 'id' | 'completed' | 'order'>,
                  );
                  results.push(`Task added with ID: ${newTask.id}`);
                  break;
                }
                case 'toggleComplete': {
                  if (!op.taskId) {
                    throw new Error('Task ID is required for toggleComplete operation in batch.');
                  }
                  let newCompletedStatus: boolean;
                  if (typeof op.taskStatus === 'boolean') {
                    newCompletedStatus = op.taskStatus;
                  } else {
                    const currentTask = await this.taskProvider.getTask(op.taskId);
                    if (!currentTask) {
                      throw new Error(`Task with ID "${op.taskId}" not found.`);
                    }
                    newCompletedStatus = !currentTask.completed;
                  }
                  await this.taskProvider.updateTask(op.taskId, { completed: newCompletedStatus });
                  results.push(
                    `Task ${op.taskId} status set to ${newCompletedStatus ? 'complete' : 'incomplete'}.`,
                  );
                  break;
                }
                case 'delete': {
                  if (!op.taskId) {
                    throw new Error('Task ID is required for delete operation in batch.');
                  }
                  // Assuming taskProvider has a deleteTask method.
                  // This was confirmed to exist in ITaskProvider during planning.
                  const deleted = await this.taskProvider.deleteTask(op.taskId);
                  if (deleted) {
                    results.push(`Task ${op.taskId} deleted.`);
                  } else {
                    results.push(`Task ${op.taskId} not found or failed to delete.`);
                  }
                  break;
                }
                default:{
                  // To satisfy the exhaustive check for op.action, explicitly cast to any
                  // if specific actions are not handled, or add more cases.
                  results.push(`Unknown action: ${(op as any).action}`);
                }
              }
            } catch (e: any) {
              results.push(
                `Error processing operation (${op.action} ${op.taskId || op.taskTitle || ''}): ${e.message}`,
              );
            }
          }
          return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(results.join('\n'))]);
        }
        default: {
          const _exhaustiveCheck: never = input.operation;
          throw new vscode.LanguageModelError('Invalid operation specified: ' + _exhaustiveCheck);
        }
      }
    } catch (error: unknown) {
      if (error instanceof vscode.LanguageModelError) {
        throw error;
      }
      const errorMessageText = error instanceof Error ? error.message : 'An unexpected error occurred.';
      throw new vscode.LanguageModelError('Failed to execute task operation: ' + errorMessageText);
    }
  }
}
