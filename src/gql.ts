import {
  GraphQLBoolean, GraphQLEnumType, GraphQLInt,
  GraphQLList, GraphQLObjectType, GraphQLSchema, GraphQLString,
} from 'graphql'
import { GraphQLJSONObject } from 'graphql-type-json'

import { DataDomain } from './dataDomain'

/**
 * Creates the GraphQL schema.
 */
export function schema(dataDomain: DataDomain): GraphQLSchema {
  // TODO GQL documentation (descriptions)
  // TODO Use GQL context instead of relying on closures to hand in the `dataDomain`

  const gqlFieldType = new GraphQLEnumType({
    // TODO GQL enum type factory utility
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
    // TODO GQL value object type factory utility
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
        resolve: async () => (await dataDomain.entityTypes()).map((value) => ({
          ...value,
          fields: Object.values(value.fields),
        }))
      },
      entities: {
        type: new GraphQLList(GraphQLJSONObject),
        args: {
          entityType: { type: GraphQLString },
        },
        // TODO Report and translate internal errors
        // Implementation details should not be exposed in the GraphQL interface
        resolve: (source, { entityType }) => dataDomain.read(entityType),
      },
    },
  })

  const gqlMutation = new GraphQLObjectType({
    name: 'Mutation',
    // TODO GQL mutation branch factory utility
    fields: {
      entityUpdate: {
        type: GraphQLJSONObject,
        args: {
          entityTypeCode: { type: GraphQLString },
          data: { type: GraphQLJSONObject },
        },
        resolve: (source, { entityTypeCode, data }) => {
          dataDomain.update(entityTypeCode, data)
        },
      }
    }
  })

  return new GraphQLSchema({ query: gqlQuery, mutation: gqlMutation })
}
