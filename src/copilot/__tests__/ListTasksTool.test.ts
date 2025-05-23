import { ListTasksTool } from '../ListTasksTool';
import { ITaskProvider } from '../../mcp/ITaskProvider';
import { ITask } from '../../common/Task';
import { jest } from '@jest/globals';
import * as vscode from 'vscode'; // For LanguageModelToolResult etc.

// Mock vscode APIs used by ListTasksTool
jest.mock('vscode', () => ({
  LanguageModelError: jest.fn().mockImplementation((message) => ({ message })),
  LanguageModelToolResult: jest.fn().mockImplementation((parts) => ({ parts })),
  LanguageModelTextPart: jest.fn().mockImplementation((text) => ({ text, kind: 'text' })), // Adjust if kind is used
  // Add other vscode components if necessary
}));

describe('ListTasksTool Order Preservation', () => {
  let listTasksTool: ListTasksTool;
  let mockTaskProvider: jest.Mocked<ITaskProvider>;

  beforeEach(() => {
    // Create a mock ITaskProvider
    mockTaskProvider = {
      getTasks: jest.fn(),
      // Mock other methods of ITaskProvider if ListTasksTool uses them, though it primarily uses getTasks
      getTask: jest.fn(),
      createTask: jest.fn(),
      updateTask: jest.fn(),
      deleteTask: jest.fn(),
      updateTaskOrder: jest.fn(),
      setDb: jest.fn(),
      initialize: jest.fn(),
      initializeForTesting: jest.fn(),
      deleteCompletedTasks: jest.fn(),
    };

    listTasksTool = new ListTasksTool(mockTaskProvider);
  });

  const createSampleTasksWithChildren = (): ITask[] => {
    return [
      {
        id: 'task1', title: 'Task 1 (Order 0)', description: 'Description 1', order: 0, completed: false,
        createdAt: new Date(), updatedAt: new Date(), parentId: null,
        children: [
          {
            id: 'task1-child2', title: 'Child 2 of Task 1 (Order 1)', description: 'Child Desc 2', order: 1, completed: false,
            createdAt: new Date(), updatedAt: new Date(), parentId: 'task1', children: []
          },
          {
            id: 'task1-child1', title: 'Child 1 of Task 1 (Order 0)', description: 'Child Desc 1', order: 0, completed: true,
            createdAt: new Date(), updatedAt: new Date(), parentId: 'task1', children: []
          },
        ]
      },
      {
        id: 'task0', title: 'Task 0 (Order -1, should be sorted first)', description: 'Description 0', order: -1, completed: false,
        createdAt: new Date(), updatedAt: new Date(), parentId: null, children: []
      },
      {
        id: 'task2', title: 'Task 2 (Order 1)', description: 'Description 2', order: 1, completed: true,
        createdAt: new Date(), updatedAt: new Date(), parentId: null,
        children: [
            // No children, but could be empty array
        ]
      },
    ];
  };
  
  // Helper to sort tasks like TaskProvider would (simplified for test setup)
  const sortTasksForTest = (tasks: ITask[]): ITask[] => {
    const sorted = [...tasks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return sorted.map(task => ({
        ...task,
        children: task.children ? sortTasksForTest(task.children) : []
    }));
  };


  it('invoke() should produce a string listing tasks in the order provided by TaskProvider (including children)', async () => {
    const rawTasks = createSampleTasksWithChildren();
    const preSortedTasks = sortTasksForTest(rawTasks); // Simulate TaskProvider's sorting
    
    mockTaskProvider.getTasks.mockResolvedValue(preSortedTasks);

    const mockToken = { isCancellationRequested: false, onCancellationRequested: jest.fn() } as any;
    const result = await listTasksTool.invoke({} as vscode.LanguageModelToolInvocationOptions<Record<string,unknown>>, mockToken);

    expect(mockTaskProvider.getTasks).toHaveBeenCalled();
    expect(result.parts.length).toBe(1);
    const outputString = (result.parts[0] as vscode.LanguageModelTextPart).text;

    // console.log('DEBUG ListTasksTool outputString:', outputString); // DEBUGGING LINE

    // Expected sequence of IDs based on preSortedTasks
    const expectedIds: string[] = [];
    const collectIds = (tasks: ITask[]) => {
      for (const task of tasks) {
        expectedIds.push(task.id);
        if (task.children) {
          collectIds(task.children);
        }
      }
    };
    collectIds(preSortedTasks); // Populate expectedIds in sorted order

    // Extract IDs from the output string
    const actualIds: string[] = [];
    const idRegex = /\(ID: ([^,)]+)/g; // Regex to find "(ID: <id>"
    let match;
    while ((match = idRegex.exec(outputString)) !== null) {
      actualIds.push(match[1]);
    }

    expect(actualIds).toEqual(expectedIds);

    // Optionally, still check a few key details like status to ensure basic formatting isn't totally broken
    expect(outputString).toContain(`(ID: task1-child1, Status: Completed)`);
    expect(outputString).toContain(`(ID: task0, Status: Incomplete)`);
    expect(outputString).toContain(`Task 1 (Order 0): Description 1`); // Check a title
    expect(outputString).toContain(`Child 2 of Task 1 (Order 1): Child Desc 2`); // Check a child title
  });

  it('invoke() should handle empty task list', async () => {
    mockTaskProvider.getTasks.mockResolvedValue([]);
    const mockToken = { isCancellationRequested: false, onCancellationRequested: jest.fn() } as any;
    const result = await listTasksTool.invoke({} as vscode.LanguageModelToolInvocationOptions<Record<string,unknown>>, mockToken);
    
    expect(result.parts.length).toBe(1);
    expect((result.parts[0] as vscode.LanguageModelTextPart).text).toBe('There are no tasks.');
  });

  it('invoke() should throw LanguageModelError if cancellation is requested before fetching', async () => {
    const mockToken = { isCancellationRequested: true, onCancellationRequested: jest.fn() } as any;
    await expect(listTasksTool.invoke({}as vscode.LanguageModelToolInvocationOptions<Record<string,unknown>>, mockToken))
      .rejects.toMatchObject({ message: 'List tasks cancelled by user.' });
  });

  it('invoke() should throw LanguageModelError if cancellation is requested after fetching', async () => {
    mockTaskProvider.getTasks.mockResolvedValue([]);
    const mockToken = { 
      isCancellationRequested: false, 
      onCancellationRequested: jest.fn(callback => {
        // Simulate cancellation after getTasks is called but before processing
        mockToken.isCancellationRequested = true;
        return { dispose: jest.fn() };
      }) 
    } as any;
    
    // This setup is a bit tricky. We'll make isCancellationRequested turn true after the first check.
    // So, the first check passes, getTasks is called, then the token is "cancelled".
    // This specific scenario is hard to deterministically test without more control over the async flow
    // or specific hooks in the tool.
    // The key is that the token.isCancellationRequested is checked AFTER getTasks resolves.
    
    const mockCancelToken = { 
        isCancellationRequested: false, 
        onCancellationRequested: jest.fn() 
    };

    // Configure getTasks to modify the token *after* it's called and resolved
    mockTaskProvider.getTasks.mockImplementationOnce(async () => {
      // Simulate that by the time this async operation finishes,
      // and before the tool checks the token again, it's now cancelled.
      mockCancelToken.isCancellationRequested = true;
      return []; // Return an empty array as if tasks were fetched
    });

    await expect(listTasksTool.invoke({} as vscode.LanguageModelToolInvocationOptions<Record<string,unknown>>, mockCancelToken as any))
        .rejects.toMatchObject({ message: 'An error occurred while listing tasks: List tasks cancelled by user after fetching tasks.' });
  });
});
