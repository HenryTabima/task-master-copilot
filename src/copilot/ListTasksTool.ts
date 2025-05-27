import * as vscode from 'vscode';
import { ITaskProvider } from '../mcp/ITaskProvider';
import { ITask } from '../common/Task';

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
      
      let taskListString = this.tasksToListString(tasks);

      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(`Current tasks:\n${taskListString}`)]);
    } catch (error) {
      if (error instanceof vscode.LanguageModelError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new vscode.LanguageModelError(`An error occurred while listing tasks: ${message}`);
    }
  }

  private tasksToListString(tasks: ITask[]): string {
    return tasks
      .map(task => {
        const taskString = this.formatTask(task);
        if (task.children && task.children.length > 0) {
          const childrenTaskStrings = task.children.map(childTask => this.formatTask(childTask));
          return `${taskString}\n  ${childrenTaskStrings.join('\n  ')}`;  
        } else {
          return taskString;
        }
      })
      .join('\n');
  }

  private formatTask(task: ITask): string {
    const status = task.completed ? 'Completed' : 'Incomplete';
    return `- (ID: ${task.id}, Status: ${status}) ${task.title}: ${task.description || 'No description'}`;
  }
}
