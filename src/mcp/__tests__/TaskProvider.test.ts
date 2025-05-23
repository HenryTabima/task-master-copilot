import { TaskProvider } from '../TaskProvider';
import { ITask } from '../../common/Task';
import { jest } from '@jest/globals';

// Mock vscode APIs to prevent errors in a non-VSCode environment
// These mocks are simplified and assume the parts of vscode API used by TaskProvider
// (like getConfiguration for debugMode) are not critical for the logic being tested.
jest.mock('vscode', () => ({
  workspace: {
    getConfiguration: jest.fn().mockReturnValue({
      get: jest.fn().mockReturnValue(false), // Default debugMode to false
    }),
  },
  window: {
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showInformationMessage: jest.fn(),
  },
  Uri: {
    joinPath: jest.fn((uri, ...paths) => ({ ...uri, fsPath: `${uri.fsPath}/${paths.join('/')}` })),
    file: jest.fn(path => ({ fsPath: path })),
  },
  ExtensionMode: {
    Development: 'development',
    Production: 'production',
  }
}));

describe('TaskProvider Order Management', () => {
  let taskProvider: TaskProvider;
  let mockDb: any; // Using 'any' for simplicity in this mock

  beforeEach(async () => { // Make beforeEach async
    taskProvider = new TaskProvider();
    mockDb = {
      data: {
        tasks: [],
        nextId: 1,
      },
      read: jest.fn().mockResolvedValue(undefined),
      write: jest.fn().mockResolvedValue(undefined),
      // Add other properties if ensureInitialized or other parts of TaskProvider need them
    };
    await taskProvider.setDb(mockDb); // Set the mock DB
    // InitializeForTesting will be called by specific test suites or tests if they need to override initial data
    // For a general setup, we can initialize it here too.
    taskProvider.initializeForTesting([], 1); 
  });

  // Helper to assert that orders are sequential and unique within a list of tasks
  const assertSequentialOrder = (tasks: ITask[], expectedParentId?: string | null) => {
    tasks.forEach((task, index) => {
      expect(task.order).toBe(index);
      if (expectedParentId !== undefined) { // expectedParentId can be null for top-level
        // For a moved task, its parentId property might be set directly by the updateTaskOrder logic.
        // The test data for children should already have the correct parentId.
        // This check is more for consistency if we were also testing parentId assignment here.
      }
    });
  };

  describe('updateTaskOrder', () => {
    describe('Move Up (Same List)', () => {
      it('should move a middle item up in a top-level list', async () => {
        const initialTasks: ITask[] = [
          { id: '1', title: 'Task 1', order: 0, parentId: null, children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
          { id: '2', title: 'Task 2', order: 1, parentId: null, children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
          { id: '3', title: 'Task 3', order: 2, parentId: null, children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
        ];
        taskProvider.initializeForTesting(initialTasks, 4);
        const taskToMove = await taskProvider.getTask('2');
        const originalUpdatedAt = taskToMove!.updatedAt;

        await new Promise(resolve => setTimeout(resolve, 10)); // Small delay

        const updatedTask = await taskProvider.updateTaskOrder('2', { order: 0, parentId: null });
        expect(updatedTask).toBeDefined();
        expect(updatedTask!.id).toBe('2');
        expect(updatedTask!.order).toBe(0); // New actual order after normalization
        expect(updatedTask!.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());

        const tasks = await taskProvider.getTasks();
        expect(tasks.map(t => t.id)).toEqual(['2', '1', '3']);
        assertSequentialOrder(tasks, null);
      });

      it('should move a middle item up in a nested list', async () => {
        const initialTasks: ITask[] = [
          { id: 'parent', title: 'Parent', order: 0, parentId: null, createdAt: new Date(), updatedAt: new Date(), completed: false, children: [
            { id: 'c1', title: 'Child 1', order: 0, parentId: 'parent', children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
            { id: 'c2', title: 'Child 2', order: 1, parentId: 'parent', children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
            { id: 'c3', title: 'Child 3', order: 2, parentId: 'parent', children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
          ]},
        ];
        taskProvider.initializeForTesting(initialTasks, 4);

        await taskProvider.updateTaskOrder('c2', { order: 0, parentId: 'parent' }); // Target order 0
        const parentTask = await taskProvider.getTask('parent');
        expect(parentTask!.children.map(t => t.id)).toEqual(['c2', 'c1', 'c3']);
        assertSequentialOrder(parentTask!.children, 'parent');
      });

      it('should move the second item to the top', async () => {
        const initialTasks: ITask[] = [
          { id: '1', title: 'Task 1', order: 0, parentId: null, children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
          { id: '2', title: 'Task 2', order: 1, parentId: null, children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
        ];
        taskProvider.initializeForTesting(initialTasks, 3);
        await taskProvider.updateTaskOrder('2', { order: 0, parentId: null }); // Target order 0
        const tasks = await taskProvider.getTasks();
        expect(tasks.map(t => t.id)).toEqual(['2', '1']);
        assertSequentialOrder(tasks, null);
      });
    });

    describe('Move Down (Same List)', () => {
      it('should move a middle item down in a top-level list', async () => {
        const initialTasks: ITask[] = [
          { id: '1', title: 'Task 1', order: 0, parentId: null, children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
          { id: '2', title: 'Task 2', order: 1, parentId: null, children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
          { id: '3', title: 'Task 3', order: 2, parentId: null, children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
        ];
        taskProvider.initializeForTesting(initialTasks, 4);
        await taskProvider.updateTaskOrder('2', { order: 2, parentId: null }); // Target order 2 (move to where 3 is)
        const tasks = await taskProvider.getTasks();
        expect(tasks.map(t => t.id)).toEqual(['1', '3', '2']);
        assertSequentialOrder(tasks, null);
      });

      it('should move an item to be the last item', async () => {
        const initialTasks: ITask[] = [
          { id: '1', title: 'Task 1', order: 0, parentId: null, children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
          { id: '2', title: 'Task 2', order: 1, parentId: null, children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
          { id: '3', title: 'Task 3', order: 2, parentId: null, children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
        ];
        taskProvider.initializeForTesting(initialTasks, 4);
        await taskProvider.updateTaskOrder('1', { order: 2, parentId: null }); // Target order 2 (move to last position)
        const tasks = await taskProvider.getTasks();
        expect(tasks.map(t => t.id)).toEqual(['2', '3', '1']);
        assertSequentialOrder(tasks, null);
      });
    });

    describe('Edge Cases (Same List)', () => {
      it('should not change order if attempting to move top item further up (order 0)', async () => {
        const initialTasks: ITask[] = [
          { id: '1', title: 'T1', order: 0, parentId: null, children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
          { id: '2', title: 'T2', order: 1, parentId: null, children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
        ];
        taskProvider.initializeForTesting(initialTasks, 3);
        const task1Initial = await taskProvider.getTask('1');
        
        const updatedTask = await taskProvider.updateTaskOrder('1', { order: 0, parentId: null });
        expect(updatedTask!.order).toBe(0);
        // Check if updatedAt was NOT updated if no effective change, or IS updated if it was re-saved.
        // The current implementation of updateTaskOrder always updates updatedAt.
        expect(updatedTask!.updatedAt.getTime()).toBeGreaterThanOrEqual(task1Initial!.updatedAt.getTime());
        
        const tasks = await taskProvider.getTasks();
        expect(tasks.map(t => t.id)).toEqual(['1', '2']);
        assertSequentialOrder(tasks, null);
      });
      
      it('should not change order if attempting to move top item further up (order -1)', async () => {
        const initialTasks: ITask[] = [
          { id: '1', title: 'T1', order: 0, parentId: null, children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
          { id: '2', title: 'T2', order: 1, parentId: null, children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
        ];
        taskProvider.initializeForTesting(initialTasks, 3);
        const task1Initial = await taskProvider.getTask('1');

        const updatedTask = await taskProvider.updateTaskOrder('1', { order: -1, parentId: null }); // Target negative order
        expect(updatedTask!.order).toBe(0); // Should be clamped to 0
        expect(updatedTask!.updatedAt.getTime()).toBeGreaterThanOrEqual(task1Initial!.updatedAt.getTime());
        
        const tasks = await taskProvider.getTasks();
        expect(tasks.map(t => t.id)).toEqual(['1', '2']);
        assertSequentialOrder(tasks, null);
      });

      it('should not change order if attempting to move bottom item further down', async () => {
        const initialTasks: ITask[] = [
          { id: '1', title: 'T1', order: 0, parentId: null, children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
          { id: '2', title: 'T2', order: 1, parentId: null, children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
        ];
        taskProvider.initializeForTesting(initialTasks, 3);
        const task2Initial = await taskProvider.getTask('2');

        const updatedTask = await taskProvider.updateTaskOrder('2', { order: 5, parentId: null }); // Order beyond length
        expect(updatedTask!.order).toBe(1); // Should be clamped to last position
        expect(updatedTask!.updatedAt.getTime()).toBeGreaterThanOrEqual(task2Initial!.updatedAt.getTime());

        const tasks = await taskProvider.getTasks();
        expect(tasks.map(t => t.id)).toEqual(['1', '2']);
        assertSequentialOrder(tasks, null);
      });
    });

    describe('Change Parent', () => {
      it('should move a top-level task to be a child of another task', async () => {
        const initialTasks: ITask[] = [
          { id: '1', title: 'Task 1 (to move)', order: 0, parentId: null, children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
          { id: '2', title: 'Task 2 (New Parent)', order: 1, parentId: null, children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
          { id: '3', title: 'Task 3', order: 2, parentId: null, children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
        ];
        taskProvider.initializeForTesting(initialTasks, 4);
        const taskToMove = await taskProvider.getTask('1');
        const originalUpdatedAt = taskToMove!.updatedAt;

        await new Promise(resolve => setTimeout(resolve, 10)); // Small delay

        const movedTask = await taskProvider.updateTaskOrder('1', { order: 0, parentId: '2' }); // Target: first child of '2'
        expect(movedTask).toBeDefined();
        expect(movedTask!.id).toBe('1');
        // ParentId is not explicitly set on the task object itself by updateTaskOrder,
        // it's implicit by its location in the parent's children array.
        // However, our ITask allows parentId, so the test data should reflect it for clarity.
        // The _getSortedTasksRecursive in getTask/getTasks should ideally populate it.
        // For now, we check its presence in the new parent's children.
        expect(movedTask!.order).toBe(0); // First child, so order 0
        expect(movedTask!.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());

        const topLevelTasks = await taskProvider.getTasks();
        expect(topLevelTasks.map(t => t.id)).toEqual(['2', '3']); // Task 1 is no longer top-level
        assertSequentialOrder(topLevelTasks, null);

        const newParentTask = await taskProvider.getTask('2');
        expect(newParentTask!.children).toBeDefined();
        expect(newParentTask!.children.length).toBe(1);
        expect(newParentTask!.children[0].id).toBe('1');
        assertSequentialOrder(newParentTask!.children, '2');
      });

      it('should move a child task to be a top-level task', async () => {
        const initialTasks: ITask[] = [
          { id: 'parent1', title: 'Parent 1', order: 0, parentId: null, createdAt: new Date(), updatedAt: new Date(), completed: false, children: [
            { id: 'c1', title: 'Child 1', order: 0, parentId: 'parent1', children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
            { id: 'c2', title: 'Child 2 (to move)', order: 1, parentId: 'parent1', children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
          ]},
          { id: 'parent2', title: 'Parent 2', order: 1, parentId: null, children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
        ];
        taskProvider.initializeForTesting(initialTasks, 4);

        // Move 'c2' to top-level, aiming for order 0
        const movedTask = await taskProvider.updateTaskOrder('c2', { order: 0, parentId: null });
        expect(movedTask).toBeDefined();
        // ParentId should be null/undefined for top-level tasks in the returned object
        // expect(movedTask!.parentId).toBeNull(); // Or undefined
        expect(movedTask!.order).toBe(0);

        const topLevelTasks = await taskProvider.getTasks();
        expect(topLevelTasks.map(t => t.id)).toEqual(['c2', 'parent1', 'parent2']);
        assertSequentialOrder(topLevelTasks, null);

        const oldParent = await taskProvider.getTask('parent1');
        expect(oldParent!.children.map(t => t.id)).toEqual(['c1']);
        assertSequentialOrder(oldParent!.children, 'parent1');
      });

      it('should move a child task from one parent to another', async () => {
        taskProvider.initializeForTesting([
          { id: 'p1', title: 'P1', order: 0, parentId: null, children: [
            { id: 'c1', title: 'C1', order: 0, parentId: 'p1', children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
            { id: 'c2', title: 'C2 (to move)', order: 1, parentId: 'p1', children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
          ], createdAt: new Date(), updatedAt: new Date(), completed: false },
          { id: 'p2', title: 'P2 (new parent)', order: 1, parentId: null, children: [
            { id: 'c3', title: 'C3', order: 0, parentId: 'p2', children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
          ], createdAt: new Date(), updatedAt: new Date(), completed: false },
        ], 5);

        const movedTask = await taskProvider.updateTaskOrder('c2', { order: 0, parentId: 'p2' }); // Move c2 to be first child of p2
        expect(movedTask!.order).toBe(0);

        const oldParent = await taskProvider.getTask('p1');
        expect(oldParent!.children.map(t => t.id)).toEqual(['c1']);
        assertSequentialOrder(oldParent!.children, 'p1');

        const newParent = await taskProvider.getTask('p2');
        expect(newParent!.children.map(t => t.id)).toEqual(['c2', 'c3']);
        assertSequentialOrder(newParent!.children, 'p2');
      });
    });

    describe('Invalid Moves', () => {
      it('should return undefined for a non-existent taskId', async () => {
        const updatedTask = await taskProvider.updateTaskOrder('nonExistent', { order: 0 });
        expect(updatedTask).toBeUndefined();
      });

      it('should move task to top-level if new parentId is non-existent (graceful fallback)', async () => {
        taskProvider.initializeForTesting([{ id: '1', title: 'Task 1', order: 0, parentId: null, children: [], createdAt: new Date(), updatedAt: new Date(), completed: false }], 2);
        const movedTask = await taskProvider.updateTaskOrder('1', { order: 0, parentId: 'nonExistentParent' });
        expect(movedTask).toBeDefined();
        // ParentId might be undefined or null, depending on how it's set in the fallback.
        // The key is that it's now a top-level task.
        expect(movedTask!.order).toBe(0);
        const tasks = await taskProvider.getTasks();
        expect(tasks.length).toBe(1);
        expect(tasks[0].id).toBe('1');
        assertSequentialOrder(tasks, null);
      });
    });
  });

  describe('getTasks and getTask Return Sorted Tasks by Order', () => {
    it('getTasks() should return tasks sorted by order, including children', async () => {
      const initialUnsortedTasks: ITask[] = [
        { id: 'b', title: 'Task B', order: 1, parentId: null, createdAt: new Date(), updatedAt: new Date(), completed: false, children: [
          { id: 'b2', title: 'Child B2', order: 1, parentId: 'b', children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
          { id: 'b1', title: 'Child B1', order: 0, parentId: 'b', children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
        ]},
        { id: 'a', title: 'Task A', order: 0, parentId: null, children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
        { id: 'c', title: 'Task C', order: 2, parentId: null, children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
      ];
      // initializeForTesting calls _sortTasksRecursive internally
      taskProvider.initializeForTesting(initialUnsortedTasks, 4); 
      
      const tasks = await taskProvider.getTasks();
      expect(tasks.map(t => t.id)).toEqual(['a', 'b', 'c']);
      assertSequentialOrder(tasks, null);

      const taskB = tasks.find(t => t.id === 'b');
      expect(taskB).toBeDefined();
      expect(taskB!.children.map(c => c.id)).toEqual(['b1', 'b2']);
      assertSequentialOrder(taskB!.children, 'b');
    });

    it('getTask() should return a task with children sorted by order', async () => {
      const initialUnsortedTasks: ITask[] = [
        { id: 'parent', title: 'Parent', order: 0, parentId: null, createdAt: new Date(), updatedAt: new Date(), completed: false, children: [
          { id: 'z', title: 'Child Z', order: 2, parentId: 'parent', children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
          { id: 'x', title: 'Child X', order: 0, parentId: 'parent', children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
          { id: 'y', title: 'Child Y', order: 1, parentId: 'parent', children: [], createdAt: new Date(), updatedAt: new Date(), completed: false },
        ]},
      ];
      taskProvider.initializeForTesting(initialUnsortedTasks, 4);

      const parentTask = await taskProvider.getTask('parent');
      expect(parentTask).toBeDefined();
      expect(parentTask!.children).toBeDefined();
      expect(parentTask!.children.map(c => c.id)).toEqual(['x', 'y', 'z']);
      assertSequentialOrder(parentTask!.children, 'parent');
    });
  });
});
