import { assert } from 'chai';
import mockNetworkInterface from './mocks/mockNetworkInterface';
import ApolloClient, { addTypename } from '../src';

import gql from 'graphql-tag';

describe('mutation results', () => {
  const query = gql`
    query todoList {
      todoList(id: 5) {
        id
        todos {
          id
          text
          completed
          __typename
        }
        __typename
      }
      __typename
    }
  `;

  const result = {
    data: {
      __typename: 'Query',
      todoList: {
        __typename: 'TodoList',
        id: '5',
        todos: [
          {
            __typename: 'Todo',
            id: '3',
            text: 'Hello world',
            completed: false,
          },
          {
            __typename: 'Todo',
            id: '6',
            text: 'Second task',
            completed: false,
          },
          {
            __typename: 'Todo',
            id: '12',
            text: 'Do other stuff',
            completed: false,
          },
        ],
      },
    },
  };

  let client: ApolloClient;
  let networkInterface;

  function setup(...mockedResponses) {
    networkInterface = mockNetworkInterface({
      request: { query },
      result,
    }, ...mockedResponses);

    client = new ApolloClient({
      networkInterface,
      // XXX right now this isn't compatible with our mocking
      // strategy...
      // FIX BEFORE PR MERGE
      // queryTransformer: addTypename,
      dataIdFromObject: (obj: any) => {
        if (obj.id && obj.__typename) {
          return obj.__typename + obj.id;
        }
        return null;
      },
    });

    return client.query({
      query,
    });
  };

  it('correctly primes cache for tests', () => {
    return setup()
      .then(() => client.query({
        query,
      }));
  });

  it('correctly integrates field changes by default', () => {
    const mutation = gql`
      mutation setCompleted {
        setCompleted(todoId: "3") {
          id
          completed
          __typename
        }
        __typename
      }
    `;

    const mutationResult = {
      data: {
        __typename: 'Mutation',
        setCompleted: {
          __typename: 'Todo',
          id: '3',
          completed: true,
        }
      }
    };

    return setup({
      request: { query: mutation },
      result: mutationResult,
    })
    .then(() => {
      return client.mutate({ mutation });
    })
    .then(() => {
      return client.query({ query });
    })
    .then((newResult: any) => {
      assert.isTrue(newResult.data.todoList.todos[0].completed);
    });
  });

  describe('ARRAY_INSERT', () => {
    const mutation = gql`
      mutation createTodo {
        # skipping arguments in the test since they don't matter
        createTodo {
          id
          text
          completed
          __typename
        }
        __typename
      }
    `;

    const mutationResult = {
      data: {
        __typename: 'Mutation',
        createTodo: {
          __typename: 'Todo',
          id: '99',
          text: 'This one was created with a mutation.',
          completed: true,
        }
      }
    };

    it('correctly integrates a basic object at the beginning', () => {
      return setup({
        request: { query: mutation },
        result: mutationResult,
      })
      .then(() => {
        return client.mutate({
          mutation,
          applyResult: [{
            type: 'ARRAY_INSERT',
            resultPath: [ 'createTodo' ],
            storePath: [ 'TodoList5', 'todos' ],
            where: 'PREPEND',
          }],
        });
      })
      .then(() => {
        return client.query({ query });
      })
      .then((newResult: any) => {
        // There should be one more todo item than before
        assert.equal(newResult.data.todoList.todos.length, 4);

        // Since we used `prepend` it should be at the front
        assert.equal(newResult.data.todoList.todos[0].text, 'This one was created with a mutation.');
      });
    });

    it('correctly integrates a basic object at the end', () => {
      return setup({
        request: { query: mutation },
        result: mutationResult,
      })
      .then(() => {
        return client.mutate({
          mutation,
          applyResult: [{
            type: 'ARRAY_INSERT',
            resultPath: [ 'createTodo' ],
            storePath: [ 'TodoList5', 'todos' ],
            where: 'APPEND',
          }],
        });
      })
      .then(() => {
        return client.query({ query });
      })
      .then((newResult: any) => {
        // There should be one more todo item than before
        assert.equal(newResult.data.todoList.todos.length, 4);

        // Since we used `APPEND` it should be at the end
        assert.equal(newResult.data.todoList.todos[3].text, 'This one was created with a mutation.');
      });
    });

    it('accepts two operations', () => {
      return setup({
        request: { query: mutation },
        result: mutationResult,
      })
      .then(() => {
        return client.mutate({
          mutation,
          applyResult: [{
            type: 'ARRAY_INSERT',
            resultPath: [ 'createTodo' ],
            storePath: [ 'TodoList5', 'todos' ],
            where: 'PREPEND',
          }, {
            type: 'ARRAY_INSERT',
            resultPath: [ 'createTodo' ],
            storePath: [ 'TodoList5', 'todos' ],
            where: 'APPEND',
          }],
        });
      })
      .then(() => {
        return client.query({ query });
      })
      .then((newResult: any) => {
        // There should be one more todo item than before
        assert.equal(newResult.data.todoList.todos.length, 5);

        // There will be two copies
        assert.equal(newResult.data.todoList.todos[0].text, 'This one was created with a mutation.');

        assert.equal(newResult.data.todoList.todos[4].text, 'This one was created with a mutation.');
      });
    });
  });

  describe('DELETE', () => {
    const mutation = gql`
      mutation deleteTodo {
        # skipping arguments in the test since they don't matter
        deleteTodo {
          id
          __typename
        }
        __typename
      }
    `;

    const mutationResult = {
      data: {
        __typename: 'Mutation',
        deleteTodo: {
          __typename: 'Todo',
          id: '3',
        }
      }
    };

    it('deletes an object from an array', () => {
      return setup({
        request: { query: mutation },
        result: mutationResult,
      })
      .then(() => {
        return client.mutate({
          mutation,
          applyResult: [{
            type: 'DELETE',
            dataId: 'Todo3',
          }],
        });
      })
      .then(() => {
        return client.query({ query });
      })
      .then((newResult: any) => {
        // There should be one more todo item than before
        assert.equal(newResult.data.todoList.todos.length, 2);
      });
    });
  });
});