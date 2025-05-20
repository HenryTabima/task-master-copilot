import * as vscode from 'vscode';
import { ITaskProvider } from '../mcp/ITaskProvider';

/**
 * Represents a tool that lists all current tasks.
 * This tool does not take any input parameters.
 */
export class ListTasksTool implements vscode.LanguageModelTool<Record<string, unknown>> {
  public readonly name = 'listTasksTool';
  public readonly description = 'Lists all current tasks. Does not take any input parameters.';
  public readonly toolReferenceName = 'listTasks';

  private taskProvider: ITaskProvider;

  /**
   * Creates a new instance of the ListTasksTool.
   * @param taskProvider The task provider instance to use for retrieving tasks.
   */
  constructor(taskProvider: ITaskProvider) {
    this.taskProvider = taskProvider;
  }

  /**
   * Executes the tool to list all tasks.
   * @param _options The options for invoking the tool. For this tool, input arguments are not expected.
   * @param token A cancellation token for the operation.
   * @returns A promise that resolves to a LanguageModelToolResult object.
   */
  public async invoke(
    _options: vscode.LanguageModelToolInvocationOptions<Record<string, unknown>>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    if (token.isCancellationRequested) {
      throw new vscode.LanguageModelError('List tasks cancelled by user.');
    }
    try {
      const tasks = await this.taskProvider.getTasks();

      if (token.isCancellationRequested) {
        throw new vscode.LanguageModelError('List tasks cancelled by user after fetching tasks.');
      }

      if (tasks.length === 0) {
        return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart('There are no tasks.')]);
      }

      const taskList = tasks.map(task => {
        let taskString = `ID: ${task.id}, Title: ${task.title}, Status: ${task.completed ? 'Completed' : 'Pending'}`;
        if (task.description) {
          taskString += `, Description: ${task.description}`;
        }
        // Consider adding child task information if necessary, similar to original TaskTool
        return taskString;
      }).join('\n');

      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(`Current tasks:\n${taskList}`)]);
    } catch (error) {
      if (error instanceof vscode.LanguageModelError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new vscode.LanguageModelError(`An error occurred while listing tasks: ${message}`);
    }
  }
}
