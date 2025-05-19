import * as vscode from 'vscode';
import { ITask } from '../common/Task';
import { ITaskProvider } from '../mcp/ITaskProvider';

/**
 * Interface for the input parameters of the Task Manager tool.
 * Matches the inputSchema defined in package.json.
 */
interface ITaskToolInput {
  operation: 'list' | 'add' | 'toggleComplete' | 'deleteCompleted';
  taskId?: string;
  taskTitle?: string;
  taskDescription?: string;
  parentId?: string;
  taskStatus?: boolean;
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
      case 'deleteCompleted': // Added case for deleteCompleted
        title = 'Delete Completed Tasks';
        message = 'Are you sure you want to delete all completed tasks?';
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
          // Added case for deleteCompleted
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
