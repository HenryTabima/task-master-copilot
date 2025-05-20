import * as vscode from 'vscode';
import { ITaskProvider } from '../mcp/ITaskProvider';

/**
 * Represents a tool that deletes all completed tasks.
 * This tool does not take any input parameters.
 */
export class DeleteCompletedTasksTool implements vscode.LanguageModelTool<Record<string, unknown>> {
  public readonly name = 'deleteCompletedTasksTool';
  public readonly description = 'Deletes all completed tasks. Does not take any input parameters.';
  public readonly toolReferenceName = 'deleteCompletedTasks';

  private taskProvider: ITaskProvider;

  /**
   * Creates a new instance of the DeleteCompletedTasksTool.
   * @param taskProvider The task provider instance to use for deleting tasks.
   */
  constructor(taskProvider: ITaskProvider) {
    this.taskProvider = taskProvider;
  }

  /**
   * Executes the tool to delete all completed tasks.
   * @param _options The options for invoking the tool. For this tool, input arguments are not expected.
   * @param token A cancellation token for the operation.
   * @returns A promise that resolves to a LanguageModelToolResult object.
   */
  public async invoke(
    _options: vscode.LanguageModelToolInvocationOptions<Record<string, unknown>>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    if (token.isCancellationRequested) {
      throw new vscode.LanguageModelError('Delete completed tasks cancelled by user.');
    }
    try {
      const allTasks = await this.taskProvider.getTasks();

      if (token.isCancellationRequested) {
        throw new vscode.LanguageModelError('Delete completed tasks cancelled by user after fetching tasks.');
      }

      const completedTasks = allTasks.filter(task => task.completed);

      if (completedTasks.length === 0) {
        return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart('No completed tasks to delete.')]);
      }

      await this.taskProvider.deleteCompletedTasks();

      // If cancellation was requested after the operation started but before it completed,
      // the operation is already done. We'll return success.
      if (token.isCancellationRequested) {
        // Log or indicate that cancellation was late, but operation completed.
        // For now, just proceed to return success.
      }

      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(`Successfully deleted ${completedTasks.length} completed task(s).`)]);
    } catch (error) {
      if (error instanceof vscode.LanguageModelError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new vscode.LanguageModelError(`An error occurred while deleting completed tasks: ${message}`);
    }
  }
}
