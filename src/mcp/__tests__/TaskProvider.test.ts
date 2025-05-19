import { TaskProvider } from '../TaskProvider';
import { ITask } from '../../common/Task';
import { TaskDb } from '../../common/Database';

describe('TaskProvider', () => {
  let taskProvider: TaskProvider;
  let mockDb: TaskDb;
  let mockFireonDidChangeData: jest.Mock;
  let mockDisposeOnDidChangeData: jest.Mock;

  beforeEach(async () => {
    taskProvider = new TaskProvider();

    mockFireonDidChangeData = jest.fn();
    mockDisposeOnDidChangeData = jest.fn();

    mockDb = {
      data: {
        tasks: [],
        nextId: 1,
      },
      read: jest.fn().mockResolvedValue(undefined),
      write: jest.fn().mockImplementation(async () => {
        // If the write operation is supposed to fire the event:
        // mockFireonDidChangeData();
      }),
      // Mock _onDidChangeData as an object with a fire method
      _onDidChangeData: {
        fire: mockFireonDidChangeData,
        // Add other EventEmitter methods if your code uses them, e.g., event, dispose
      } as any, // Use 'as any' to simplify if not all EventEmitter props are mocked
      // Mock onDidChangeData as a function that returns a disposable object
      onDidChangeData: jest.fn(() => ({
        dispose: mockDisposeOnDidChangeData,
      })),
    };
    await taskProvider.setDb(mockDb);
  });

  // Reset mocks before each test to ensure test isolation
  afterEach(() => {
    mockFireonDidChangeData.mockClear();
    mockDisposeOnDidChangeData.mockClear();
    // Clear any other mocks if necessary, e.g., mockDb.read, mockDb.write
    (mockDb.read as jest.Mock).mockClear();
    (mockDb.write as jest.Mock).mockClear();
    (mockDb.onDidChangeData as jest.Mock).mockClear();
  });

  it('should create and retrieve a task', async () => {
    const newTaskData = { title: 'Test Task', description: 'Test Description' };
    const createdTask = await taskProvider.createTask(newTaskData);

    expect(createdTask).toBeDefined();
    expect(createdTask.title).toBe(newTaskData.title);
    expect(createdTask.description).toBe(newTaskData.description);
    expect(createdTask.completed).toBe(false);

    const retrievedTask = await taskProvider.getTask(createdTask.id);
    expect(retrievedTask).toEqual(createdTask);
  });

  it('should return undefined for a non-existent task', async () => {
    const retrievedTask = await taskProvider.getTask('non-existent-id');
    expect(retrievedTask).toBeUndefined();
  });

  it('should get all tasks', async () => {
    // Reset tasks in mockDb for this specific test if needed, or rely on createTask
    // For this test, creating tasks anew is fine.
    mockDb.data.tasks = []; // Ensure clean state for this test
    mockDb.data.nextId = 1;
    await taskProvider.setDb(mockDb); // Re-initialize with clean mockDb

    await taskProvider.createTask({ title: 'Task 1', description: 'Description 1' });
    await taskProvider.createTask({ title: 'Task 2', description: 'Description 2' });

    const allTasks = await taskProvider.getTasks();
    expect(allTasks.length).toBe(2);
  });

  it('should update a task', async () => {
    // Ensure clean state for this test
    mockDb.data.tasks = [];
    mockDb.data.nextId = 1;
    await taskProvider.setDb(mockDb);

    const task = await taskProvider.createTask({ title: 'Old Title', description: 'Old Description' });
    const updates: Partial<ITask> = {
      title: 'New Title',
      completed: true,
    };

    const updatedTask = await taskProvider.updateTask(task.id, updates);

    expect(updatedTask).toBeDefined();
    expect(updatedTask?.id).toBe(task.id);
    expect(updatedTask?.title).toBe('New Title');
    expect(updatedTask?.description).toBe('Old Description'); // Description wasn't updated
    expect(updatedTask?.completed).toBe(true);

    const retrievedTask = await taskProvider.getTask(task.id);
    expect(retrievedTask?.title).toBe('New Title');
    expect(retrievedTask?.completed).toBe(true);
  });

  it('should mark a task as incomplete', async () => {
    // Ensure clean state
    mockDb.data.tasks = [];
    mockDb.data.nextId = 1;
    await taskProvider.setDb(mockDb);

    const task = await taskProvider.createTask({ title: 'Completable Task' });
    // Mark as complete first
    await taskProvider.updateTask(task.id, { completed: true });
    let retrievedTask = await taskProvider.getTask(task.id);
    expect(retrievedTask?.completed).toBe(true);

    // Mark as incomplete
    const updatedTask = await taskProvider.updateTask(task.id, { completed: false });
    expect(updatedTask).toBeDefined();
    expect(updatedTask?.completed).toBe(false);

    retrievedTask = await taskProvider.getTask(task.id);
    expect(retrievedTask?.completed).toBe(false);
  });

  it('should return undefined when updating a non-existent task', async () => {
    const updatedTask = await taskProvider.updateTask('non-existent-id', { title: 'New Title' });
    expect(updatedTask).toBeUndefined();
  });

  it('should delete a task', async () => {
    // Ensure clean state
    mockDb.data.tasks = [];
    mockDb.data.nextId = 1;
    await taskProvider.setDb(mockDb);

    const task = await taskProvider.createTask({ title: 'To Be Deleted', description: 'Delete me' });
    const result = await taskProvider.deleteTask(task.id);
    expect(result).toBe(true);

    const retrievedTask = await taskProvider.getTask(task.id);
    expect(retrievedTask).toBeUndefined();
  });

  it('should return false when deleting a non-existent task', async () => {
    const result = await taskProvider.deleteTask('non-existent-id');
    expect(result).toBe(false);
  });

  describe('Sub-task functionality', () => {
    beforeEach(async () => {
      // Ensure a clean state for sub-task tests by resetting the mockDb
      // and re-applying it to the taskProvider instance.
      mockDb.data.tasks = [];
      mockDb.data.nextId = 1;
      await taskProvider.setDb(mockDb);
    });

    it('should create a sub-task with a parentId', async () => {
      const parentTask = await taskProvider.createTask({ title: 'Parent Task' });
      const subTaskData = { title: 'Sub-task 1', parentId: parentTask.id };
      const createdSubTask = await taskProvider.createTask(subTaskData);

      expect(createdSubTask).toBeDefined();
      expect(createdSubTask.title).toBe(subTaskData.title);
      expect(createdSubTask.parentId).toBe(parentTask.id);

      const retrievedSubTask = await taskProvider.getTask(createdSubTask.id);
      expect(retrievedSubTask).toEqual(createdSubTask);
    });

    it('should retrieve only direct sub-tasks for a given parentId', async () => {
      const parent1 = await taskProvider.createTask({ title: 'Parent 1' });
      await taskProvider.createTask({ title: 'Sub-task P1-1', parentId: parent1.id });
      await taskProvider.createTask({ title: 'Sub-task P1-2', parentId: parent1.id });

      const parent2 = await taskProvider.createTask({ title: 'Parent 2' });
      await taskProvider.createTask({ title: 'Sub-task P2-1', parentId: parent2.id });

      // Create a grandchild, should not be returned as direct child of parent1
      const subTaskP11 = (await taskProvider.getTasks({ parentId: parent1.id }))[0];
      await taskProvider.createTask({ title: 'Grandchild P1-1-1', parentId: subTaskP11.id });

      const subTasksOfParent1 = await taskProvider.getTasks({ parentId: parent1.id });
      expect(subTasksOfParent1.length).toBe(2);
      expect(subTasksOfParent1.every((task) => task.parentId === parent1.id)).toBe(true);
      expect(subTasksOfParent1.find((t) => t.title === 'Sub-task P1-1')).toBeDefined();
      expect(subTasksOfParent1.find((t) => t.title === 'Sub-task P1-2')).toBeDefined();
    });

    it('should retrieve only top-level tasks when parentId is null', async () => {
      const topLevel1 = await taskProvider.createTask({ title: 'Top Level 1' });
      const parent1 = await taskProvider.createTask({ title: 'Parent 1 with Sub-task' });
      await taskProvider.createTask({ title: 'Sub-task P1-S1', parentId: parent1.id });
      const topLevel2 = await taskProvider.createTask({ title: 'Top Level 2' });

      const topLevelTasks = await taskProvider.getTasks({ parentId: null });
      expect(topLevelTasks.length).toBe(3); // Corrected expectation
      expect(topLevelTasks.find((t) => t.id === topLevel1.id)).toBeDefined();
      expect(topLevelTasks.find((t) => t.id === topLevel2.id)).toBeDefined();
      expect(topLevelTasks.find((t) => t.id === parent1.id)).toBeDefined();
    });
  });
});
