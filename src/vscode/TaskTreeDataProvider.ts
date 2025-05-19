import * as vscode from 'vscode';
import { ITask } from '../common/Task';
import { ITaskProvider } from '../mcp/ITaskProvider';
import { TaskDb } from '../common/Database';

/**
 * Represents an individual task in the TreeView.
 */
export class TaskItem extends vscode.TreeItem {
  constructor(
    public readonly task: ITask,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command,
  ) {
    super(task.title, collapsibleState);
    this.description = task.description;
    this.tooltip = `${task.title}${task.description ? ` - ${task.description}` : ''}`;
    this.iconPath = new vscode.ThemeIcon(task.completed ? 'check' : 'circle-outline');
    // Align contextValue with package.json when clauses
    this.contextValue = task.completed ? 'task-complete' : 'task-incomplete';
  }
}

/**
 * Provides data for the task tree view.
 */
export class TaskTreeDataProvider implements vscode.TreeDataProvider<TaskItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<TaskItem | undefined | null | void> = new vscode.EventEmitter<
    TaskItem | undefined | null | void
  >();
  readonly onDidChangeTreeData: vscode.Event<TaskItem | undefined | null | void> = this._onDidChangeTreeData.event;
  private dbChangeListener: vscode.Disposable | undefined;

  constructor(
    private taskProvider: ITaskProvider,
    taskDb: TaskDb, // Assuming TaskDb is correctly passed and used for change listening
  ) {
    // If TaskDb emits an event when data changes (e.g., after saveToDatabase in TaskProvider),
    // this will trigger a refresh.
    this.dbChangeListener = taskDb.onDidChangeData(() => {
      this.refresh();
    });
  }

  /**
   * Dispose of the event listener when the tree view is disposed.
   */
  dispose(): void {
    this.dbChangeListener?.dispose();
  }

  /**
   * Refreshes the tree view.
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Deletes all completed tasks and refreshes the tree view.
   */
  async deleteCompletedTasks(): Promise<void> {
    const confirmation = await vscode.window.showWarningMessage(
      'Are you sure you want to delete all completed tasks?',
      { modal: true },
      'Yes',
    );

    if (confirmation !== 'Yes') {
      vscode.window.showInformationMessage('Delete operation cancelled.');
      return;
    }

    // TaskProvider.deleteCompletedTasks has been updated to handle hierarchical deletion
    const numDeleted = await this.taskProvider.deleteCompletedTasks();
    if (numDeleted > 0) {
      this.refresh(); // Refresh the entire tree
      vscode.window.showInformationMessage(`${numDeleted} completed task(s) deleted.`);
    } else {
      vscode.window.showInformationMessage('No completed tasks to delete.');
    }
  }

  /**
   * Gets the tree item for the given element.
   * @param element The element for which to get the tree item.
   * @returns The tree item.
   */
  getTreeItem(element: TaskItem): vscode.TreeItem {
    return element;
  }

  /**
   * Gets the children of the given element or root if no element is provided.
   * @param element The element for which to get children.
   * @returns A promise that resolves to an array of children.
   */
  async getChildren(element?: TaskItem): Promise<TaskItem[]> {
    if (element) {
      // If an element is provided, we are fetching its children.
      // The children are directly available in element.task.children.
      const childrenTasks = element.task.children || [];
      return childrenTasks.map((task) => {
        const collapsibleState = (task.children && task.children.length > 0)
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.None;
        return new TaskItem(task, collapsibleState);
      });
    } else {
      // If no element is provided, we are fetching top-level tasks.
      // TaskProvider.getTasks() now returns only top-level tasks.
      const topLevelTasks = await this.taskProvider.getTasks();
      return topLevelTasks.map((task) => {
        const collapsibleState = (task.children && task.children.length > 0)
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.None;
        return new TaskItem(task, collapsibleState);
      });
    }
  }
}
