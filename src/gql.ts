import {
  GraphQLBoolean, GraphQLEnumType, GraphQLInt,
  GraphQLList, GraphQLObjectType, GraphQLSchema, GraphQLString,
} from 'graphql'
import { GraphQLJSONObject } from 'graphql-type-json'

import { Database } from './db'

/**
 * Creates the GraphQL schema.
 */
export function schema(db: Database): GraphQLSchema {
  // TODO GQL documentation (descriptions)

  const gqlFieldType = new GraphQLEnumType({
    name: 'FieldType',
    values: {
      string: { value: 'string' },
      number: { value: 'number' },
      date: { value: 'date' },
      datetime: { value: 'datetime' },
      time: { value: 'time' },
    },
  })
  const gqlFieldMeta = new GraphQLObjectType({
    name: 'FieldMeta',
    // TODO Change to { [fieldName]: FieldConfig } type?
    fields: {
      id: { type: GraphQLInt },
      name: { type: GraphQLString },
      code: { type: GraphQLString },
      placeholder: { type: GraphQLString },
      type: { type: gqlFieldType },
      identifier: { type: GraphQLBoolean },
      hidden: { type: GraphQLBoolean },
    },
  })
  const gqlEntityTitleFormat = new GraphQLObjectType({
    name: 'EntityTitleFormat',
    fields: {
      title: { type: GraphQLString },
      subtitle: { type: GraphQLString },
    },
  })
  const gqlEntityMeta = new GraphQLObjectType({
    name: 'EntityMeta',
    fields: {
      id: { type: GraphQLInt },
      name: { type: GraphQLString },
      code: { type: GraphQLString },
      titleFormat: { type: gqlEntityTitleFormat },
      fields: { type: new GraphQLList(gqlFieldMeta) },
    }
  })

  const gqlQuery = new GraphQLObjectType({
    name: 'Query',
    fields: {
      entityTypes: {
        type: new GraphQLList(gqlEntityMeta),
        resolve: async () => {
          const entityTypes: any = await db.entityTypes()
          for (const et of entityTypes) {
            et.fields = Object.values(et.fields)
          }
          return entityTypes
        }
      },
      entities: {
        type: new GraphQLList(GraphQLJSONObject),
        args: {
          entityType: { type: GraphQLString },
        },
        // TODO Report and translate internal errors
        // Implementation details should not be exposed in the GraphQL interface
        resolve: (source, { entityType }) => db.read(entityType),
      },
    },
  })

  return new GraphQLSchema({ query: gqlQuery })
}
