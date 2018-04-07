const hapi = require('hapi');
const { buildSchema } = require('graphql');
const {
  GraphQLObjectType,
  GraphQLSchema,
} = require('graphql');
const { hasRoute } = require('hapi-test-utils').routing;

const plugin = require('./index');

const schema = buildSchema(`
type Query {
  hello: String
}
`);
const root = {
  hello: () => 'Hello world!',
};

describe('plugin registration', () => {
  let server;

  beforeEach(() => {
    server = new hapi.Server({});
  });
  it('works with hapi v17+', async () => {
    await server.register({
      plugin,
      options: {
        route: {
          path: '/graphql',
          config: {
          },
        },
      },
    });
    expect(hasRoute(server, '/graphql', 'get')).toBeTruthy();
    expect(hasRoute(server, '/graphql', 'post')).toBeTruthy();
  });
});

describe('query operations', () => {
  let server;

  beforeAll(async () => {
    server = new hapi.Server({});
    await server.register({
      plugin,
      options: {
        query: {
          schema,
          rootValue: root,
          formatError: error => ({
            message: error.message,
            locations: error.locations,
            stack: error.stack,
          }),
        },
        route: {
          path: '/graphql',
          config: {
          },
        },
      },
    });
  });

  it('responds to hello world queries (GET)', async () => {
    const request = {
      method: 'get',
      url: '/graphql?query={ hello }',
    };

    const response = await server.inject(request);

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.payload);
    expect(payload.data.hello).toBe('Hello world!');
  });

  it('responds to hello world queries (POST)', async () => {
    const request = {
      method: 'post',
      url: '/graphql',
      payload: {
        query: '{hello}',
      },
    };

    const response = await server.inject(request);

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.payload);
    expect(payload.data.hello).toBe('Hello world!');
  });

  it('complains on malformed queries', async () => {
    const request = {
      method: 'get',
      url: '/graphql?query={ }',
    };

    const response = await server.inject(request);

    expect(response.statusCode).toBe(400);
    const payload = JSON.parse(response.payload);
    expect(payload.errors).toHaveLength(1);
    expect(payload.errors[0].message).toMatch(/Syntax Error/);
  });
});

describe('malformed schemas', () => {
  it('handles it by showing the schema error', async () => {
    const rootSchema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'Query',
        description: 'i haz the queries',
        fields: () => ({

        })
      }),
    });

    const server = new hapi.Server();
    await server.register({
      plugin,
      options: {
        query: (request) => ({
          schema: rootSchema,
          formatError: error => ({
            message: error.message,
            locations: error.locations,
            stack: error.stack
          }),
          context: {
            request,
          }
        }),
        route: {
          path: '/graphql',
        }
      }
    });

    const request = {
      method: 'POST',
      url: '/graphql',
      payload: {
        query: `query giveIt {
          someQuery {
            id
          }
        }`,
      },
    };
    const response = await server.inject(request);
    expect(response.statusCode).toBe(500);
    const data = JSON.parse(response.payload);
    expect(data.errors).toHaveLength(1);
    expect(data.errors[0].message).toMatch(/Type Query must define one or more fields/)
  });
});
