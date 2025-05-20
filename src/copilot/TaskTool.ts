import * as vscode from 'vscode';
import { ITask } from '../common/Task';
import { ITaskProvider } from '../mcp/ITaskProvider';

/**
 * Represents a single operation within a batch request.
 */
interface ITaskOperation {
  action: 'add' | 'toggleComplete' | 'delete' | 'add-subtask';
  taskId?: string;
  taskTitle?: string;
  taskDescription?: string;
  /**
   * The ID of the parent task.
   * Used only with the 'add-subtask' action.
   * Should NOT be provided for the 'add' action when creating a top-level task.
   */
  parentId?: string;
  taskStatus?: boolean;
  /**
   * An array of child task operations to be processed recursively.
   * Used only with the 'add' action.
   * Should NOT be provided for the 'add-subtask' action, as subtasks cannot have their own children defined in the same operation.
   */
  childTasks?: ITaskOperation[]; // Re-added childTasks for 'add' operation
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
  operation: 'list' | 'toggleComplete' | 'deleteCompleted' | 'batch';
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

          const tasks: ITask[] = await this.taskProvider.getTasks(); // Returns top-level tasks
          // Recursive function to flatten the task tree for display
          const flattenTasks = (taskList: ITask[], level = 0): string[] => {
            let result: string[] = [];
            for (const task of taskList) {
              const prefix = '  '.repeat(level);
              let taskStr = `${prefix}ID: ${task.id}, Title: ${task.title}, Completed: ${task.completed}, Order: ${task.order}`;
              result.push(taskStr);
              if (task.children && task.children.length > 0) {
                result = result.concat(flattenTasks(task.children, level + 1));
              }
            }
            return result;
          };
          const taskListString = flattenTasks(tasks).join('\n');

          return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(taskListString || 'No tasks found.')]);
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
                  if (op.parentId) { 
                    throw new Error('The \'add\' operation cannot have a parentId. Use \'add-subtask\' to create subtasks.');
                  }

                  const createdTask = await this.taskProvider.createTask({
                    title: op.taskTitle!,
                    description: op.taskDescription,
                  });
                  results.push(`Task added with ID: ${createdTask.id}`);

                  if (op.childTasks && op.childTasks.length > 0) {
                    const processChildTasks = async (parentTask: ITask, children: ITaskOperation[]) => {
                      for (const childOp of children) {
                        if (childOp.action !== 'add' && childOp.action !== 'add-subtask') {
                          results.push(`Skipping invalid child action '${childOp.action}' for task '${childOp.taskTitle || childOp.taskId}'. Child tasks for 'add' should be 'add' or 'add-subtask'.`);
                          continue;
                        }
                        if (!childOp.taskTitle) {
                          results.push(`Error: Child task title is required for parent ID ${parentTask.id}.`);
                          continue;
                        }

                        let newChildTask: ITask;
                        // Regardless of childOp.action ('add' or 'add-subtask'), it becomes a subtask of parentTask here.
                        // The distinction between 'add' and 'add-subtask' for children primarily affects if *they* can have children in *this specific operation*.
                        // For simplicity and to align with the parent 'add' not taking parentId, child tasks here are always created under parentTask.
                        newChildTask = await this.taskProvider.createTask({
                          title: childOp.taskTitle!,
                          description: childOp.taskDescription,
                          parentId: parentTask.id, // Child tasks are created under the parent task.
                        });
                        results.push(`Child task added with ID: ${newChildTask.id} under parent ${parentTask.id}`);

                        // Recursive call if the child task itself has childTasks defined (and is an 'add' operation)
                        // However, current logic for 'add-subtask' prevents childTasks, so this path is mainly for nested 'add' ops.
                        if (childOp.action === 'add' && childOp.childTasks && childOp.childTasks.length > 0) {
                           if (childOp.parentId && childOp.parentId !== parentTask.id) {
                               results.push(`Warning: Child task '${childOp.taskTitle}' specified a different parentId (${childOp.parentId}) than the current parent (${parentTask.id}). It will be created under ${parentTask.id}.`);
                           }
                           await processChildTasks(newChildTask, childOp.childTasks);
                        } else if (childOp.action === 'add-subtask' && childOp.childTasks && childOp.childTasks.length > 0){
                            results.push(`Warning: 'add-subtask' operation for child '${childOp.taskTitle}' under parent '${parentTask.id}' included childTasks. These will be ignored as 'add-subtask' does not support nested children in the same operation.`);
                        }
                      }
                    };
                    await processChildTasks(createdTask, op.childTasks);
                  }
                  break;
                }
                case 'add-subtask': {
                  if (!op.taskTitle) {
                    throw new Error('Task title is required for add-subtask operation in batch.');
                  }
                  if (!op.parentId) {
                    throw new Error('Parent ID is required for add-subtask operation in batch.');
                  }
                  if (op.childTasks && op.childTasks.length > 0) { 
                    throw new Error('The \'add-subtask\' operation cannot have childTasks. Create them in separate operations.');
                  }
                  const newSubtask = await this.taskProvider.createTask({
                    title: op.taskTitle!,
                    description: op.taskDescription,
                    parentId: op.parentId,
                  });
                  results.push(`Subtask added with ID: ${newSubtask.id} under parent ${op.parentId}`);
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
                  const deleted = await this.taskProvider.deleteTask(op.taskId);
                  if (deleted) {
                    results.push(`Task ${op.taskId} deleted.`);
                  } else {
                    results.push(`Task ${op.taskId} not found or failed to delete.`);
                  }
                  break;
                }
                default:{
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
