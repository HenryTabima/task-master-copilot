// Mocking the Database module
jest.mock('../../common/Database', () => {
  // Mock the TaskDb interface and createDatabase function
  const mockTaskDb = {
    data: {
      tasks: [],
      nextId: 1,
    },
    read: jest.fn().mockResolvedValue(undefined),
    write: jest.fn().mockResolvedValue(undefined),
  };

  return {
    createDatabase: jest.fn().mockResolvedValue(mockTaskDb),
    defaultDatabase: {
      tasks: [],
      nextId: 1,
    },
  };
});
