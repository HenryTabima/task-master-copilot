import { TaskTreeDataProvider, TaskItem } from '../TaskTreeDataProvider';
import { TaskProvider } from '../../mcp/TaskProvider';
import { ITask } from '../../common/Task';
import { ITaskProvider } from '../../mcp/ITaskProvider';
import { jest } from '@jest/globals';
import * as vscode from 'vscode'; // Import vscode for TreeItemCollapsibleState

// Mock vscode specifics that might be problematic in a non-vscode env
// TaskTreeDataProvider itself uses vscode.TreeItem, vscode.TreeItemCollapsibleState, and vscode.ThemeIcon
jest.mock('vscode', () => {
  // Define the class constructor mock for TreeItem
  const mockTreeItem = jest.fn().mockImplementation((labelOrUri, collapsibleState) => {
    const item: {
      label?: string | vscode.TreeItemLabel;
      id?: string;
      iconPath?: string | vscode.Uri | { light: string | vscode.Uri; dark: string | vscode.Uri } | vscode.ThemeIcon;
      description?: string | boolean;
      resourceUri?: vscode.Uri;
      tooltip?: string | vscode.MarkdownString | undefined;
      collapsibleState?: vscode.TreeItemCollapsibleState;
      command?: vscode.Command;
      contextValue?: string;
      accessibilityInformation?: vscode.AccessibilityInformation;
    } = {};

    if (typeof labelOrUri === 'string') {
      item.label = labelOrUri;
    } else if (labelOrUri && typeof labelOrUri === 'object' && 'label' in labelOrUri) { // Checking for TreeItemLabel
      item.label = labelOrUri.label;
    } else if (labelOrUri && typeof labelOrUri === 'object' && 'fsPath' in labelOrUri) { // Basic check for Uri-like
      item.resourceUri = labelOrUri;
    }
    
    item.collapsibleState = collapsibleState;
    return item;
  });

  return {
    // TreeItem: mockTreeItem, // We will mock it as a class below
    TreeItem: jest.fn(function(labelOrUri, collapsibleState) { // Mock vscode.TreeItem as a class
      if (typeof labelOrUri === 'string') {
        this.label = labelOrUri;
      } else if (labelOrUri && typeof labelOrUri === 'object' && 'label' in labelOrUri) {
        this.label = labelOrUri.label;
      } else if (labelOrUri && typeof labelOrUri === 'object' && 'fsPath' in labelOrUri) {
        this.resourceUri = labelOrUri;
      }
      this.collapsibleState = collapsibleState;
      // Add other properties that TaskItem might set directly on `super`
      this.iconPath = undefined;
      this.contextValue = undefined;
      this.id = undefined;
    }),
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
    ThemeIcon: jest.fn(id => ({ id })), // Mock ThemeIcon constructor
    EventEmitter: jest.fn(() => ({ // Mock EventEmitter
      event: jest.fn(),
      fire: jest.fn(),
      dispose: jest.fn()
    })),
    // Add any other specific vscode components if TaskItem or TaskTreeDataProvider uses them
  };
});


describe('TaskTreeDataProvider Order Preservation', () => {
  let taskProvider: ITaskProvider;
  let taskTreeDataProvider: TaskTreeDataProvider;
  let mockDb: any;

  beforeEach(async () => { // Make it async
    taskProvider = new TaskProvider(); // Actual TaskProvider
    mockDb = {
      data: { tasks: [], nextId: 1 }, // Minimal data for TaskProvider's setDb
      read: jest.fn().mockResolvedValue(undefined),
      write: jest.fn().mockResolvedValue(undefined),
      onDidChangeData: jest.fn(() => ({ dispose: jest.fn() })),
    };
    await taskProvider.setDb(mockDb); // Ensure db is set
    // InitializeForTesting is crucial for setting tasks AND this.initialized = true
    (taskProvider as TaskProvider).initializeForTesting([], 1); 

    taskTreeDataProvider = new TaskTreeDataProvider(taskProvider, mockDb);
  });

  const createSampleTasks = (count: number, parentId: string | null = null, orderOffset: number = 0): ITask[] => {
    const tasks: ITask[] = [];
    for (let i = 0; i < count; i++) {
      tasks.push({
        id: `${parentId ? parentId + '-' : ''}task${i + 1}`,
        title: `Task ${i + 1}${parentId ? ` (Child of ${parentId})` : ''}`,
        order: orderOffset + i,
        completed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        children: [],
        parentId: parentId,
      });
    }
    return tasks;
  };

  it('getChildren(undefined) should return top-level TaskItems in the order provided by TaskProvider', async () => {
    const topLevelTasks = createSampleTasks(3); 
    // Initialize TaskProvider with these specific tasks for the test
    await (taskProvider as TaskProvider).setDb(mockDb); // Re-setDb if needed for fresh data state
    (taskProvider as TaskProvider).initializeForTesting(topLevelTasks, topLevelTasks.length + 1);

    const taskItems = await taskTreeDataProvider.getChildren(undefined);

    expect(taskItems).toBeDefined();
    expect(taskItems.length).toBe(topLevelTasks.length);
    taskItems.forEach((item, index) => {
      expect(item).toBeInstanceOf(TaskItem);
      expect(item.task.id).toBe(topLevelTasks[index].id);
      expect(item.task.title).toBe(topLevelTasks[index].title);
      // Check collapsible state based on children
      expect(item.collapsibleState).toBe(
        topLevelTasks[index].children && topLevelTasks[index].children.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None
      );
    });
  });

  it('getChildren(element) should return child TaskItems in the order provided by the parent task.children', async () => {
    const childTasks = createSampleTasks(2, 'parent1'); // childTask1 (0), childTask2 (1)
    const parentTask: ITask = {
      id: 'parent1',
      title: 'Parent Task 1',
      order: 0,
      completed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      children: childTasks, // Children are already sorted by order
      parentId: null,
    };
    // Initialize provider with the parent task for this specific test
    await (taskProvider as TaskProvider).setDb(mockDb); // Re-setDb if needed
    (taskProvider as TaskProvider).initializeForTesting([parentTask], childTasks.length + 2);
    
    // Create a TaskItem for the parent to pass to getChildren
    // Ensure the mock for vscode.TreeItem is effective here
    const parentTaskItem = new TaskItem(parentTask, vscode.TreeItemCollapsibleState.Expanded, taskProvider);

    const childTaskItems = await taskTreeDataProvider.getChildren(parentTaskItem);

    expect(childTaskItems).toBeDefined();
    expect(childTaskItems.length).toBe(childTasks.length);
    childTaskItems.forEach((item, index) => {
      expect(item).toBeInstanceOf(TaskItem);
      expect(item.task.id).toBe(childTasks[index].id);
      expect(item.task.title).toBe(childTasks[index].title);
      expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None); // Assuming children have no further children
    });
  });

  it('getChildren(element) should return empty array if parent task has no children', async () => {
    const parentTask: ITask = {
      id: 'parentNoChildren',
      title: 'Parent No Children',
      order: 0,
      completed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      children: [], // No children
      parentId: null,
    };
    await (taskProvider as TaskProvider).setDb(mockDb); // Re-setDb if needed
    (taskProvider as TaskProvider).initializeForTesting([parentTask], 2);
    const parentTaskItem = new TaskItem(parentTask, vscode.TreeItemCollapsibleState.None, taskProvider);

    const childTaskItems = await taskTreeDataProvider.getChildren(parentTaskItem);
    expect(childTaskItems).toEqual([]);
  });
});
