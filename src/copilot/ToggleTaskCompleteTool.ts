import * as vscode from 'vscode';
import { ITaskProvider } from '../mcp/ITaskProvider';

/**
 * Defines the structure of the arguments for the ToggleTaskCompleteTool.
 */
interface IToggleTaskCompleteArgs {
  taskId: string;
  taskStatus?: boolean;
}

/**
 * Represents a tool that toggles the completion status of a task.
 * Requires a taskId. Optionally accepts taskStatus (boolean) to set a specific state;
 * otherwise, it toggles the current state.
 */
export class ToggleTaskCompleteTool implements vscode.LanguageModelTool<IToggleTaskCompleteArgs> {
  public readonly name = 'toggleTaskCompleteTool';
  public readonly description =
    'Toggles the completion status of a task. Requires a taskId. Optionally accepts taskStatus (boolean) to set a specific state (true for complete, false for incomplete); otherwise, it toggles the current state.';
  public readonly toolReferenceName = 'toggleTask';

  private taskProvider: ITaskProvider;

  /**
   * Creates a new instance of the ToggleTaskCompleteTool.
   * @param taskProvider The task provider instance to use for updating task status.
   */
  constructor(taskProvider: ITaskProvider) {
    this.taskProvider = taskProvider;
  }

  /**
   * Executes the tool to toggle the completion status of a task.
   * @param options The options for invoking the tool, expecting an object with taskId and optional taskStatus.
   * @param token A cancellation token for the operation.
   * @returns A promise that resolves to a LanguageModelToolResult object.
   */
  public async invoke(
    options: vscode.LanguageModelToolInvocationOptions<IToggleTaskCompleteArgs>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    // The input arguments are directly available in options.input for tools with a defined input schema
    const { taskId, taskStatus } = options.input;

    if (token.isCancellationRequested) {
      throw new vscode.LanguageModelError('Toggle task completion cancelled by user.');
    }

    if (!taskId) {
      // This case should ideally be caught by schema validation if taskId is marked as required.
      throw new vscode.LanguageModelError('Error: taskId is required to toggle task completion status.');
    }

    try {
      const task = await this.taskProvider.getTask(taskId);
      if (!task) {
        throw new vscode.LanguageModelError(`Error: Task with ID "${taskId}" not found.`);
      }

      if (token.isCancellationRequested) {
        throw new vscode.LanguageModelError('Toggle task completion cancelled by user after fetching task.');
      }

      let newStatus: boolean;
      if (typeof taskStatus === 'boolean') {
        newStatus = taskStatus;
      } else {
        newStatus = !task.completed;
      }

      await this.taskProvider.updateTask(taskId, { completed: newStatus });
      
      if (token.isCancellationRequested) {
        // Operation completed before cancellation was fully processed.
        // Consider if any rollback is needed or if this state is acceptable.
        // For now, we'll report success as the update did happen.
      }

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`Task "${task.title}" (ID: ${taskId}) marked as ${newStatus ? 'complete' : 'incomplete'}.`)
      ]);
    } catch (error) {
      if (error instanceof vscode.LanguageModelError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new vscode.LanguageModelError(`An error occurred while toggling the task status: ${message}`);
    }
  }
}
