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
    taskDb: TaskDb,
  ) {
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

    const numDeleted = await this.taskProvider.deleteCompletedTasks();
    if (numDeleted > 0) {
      this.refresh();
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
    // Fetch all tasks once to efficiently determine if any task has children.
    // This is used to set the collapsibleState correctly for all items.

    if (element) {
      // If an element is provided, we are fetching its children (sub-tasks).
      // These are tasks whose parentId matches the element's task id.
      const subTasks = await this.taskProvider.getTasks({ parentId: element.task.id });

      return subTasks.map((task) => {
        // For each sub-task, check if it has its own children (grand-children of the original element).
        const collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        return new TaskItem(task, collapsibleState);
      });
    } else {
      // If no element is provided, we are fetching top-level tasks.
      // These are tasks where parentId is null or undefined.
      // The TaskProvider's getTasks({ parentId: null }) handles finding these.
      const topLevelTasks = await this.taskProvider.getTasks({ parentId: null });

      return topLevelTasks.map((task) => {
        // For each top-level task, check if it has children.
        const collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        return new TaskItem(task, collapsibleState);
      });
    }
  }
}
