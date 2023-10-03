import {
  GraphQLBoolean, GraphQLInt,
  GraphQLList, GraphQLObjectType, GraphQLSchema, GraphQLString,
} from 'graphql'
import { GraphQLJSONObject } from 'graphql-type-json'

import { DataDomain } from './dataDomain'
import { trimMargin } from './jsext/strings'
import { newGraphQLEnumType } from './graphqlext'

type Context = {
  dataDomain: DataDomain,
}

/**
 * Creates the GraphQL schema.
 */
export function schema(): GraphQLSchema {
  const gqlFieldType = newGraphQLEnumType(
    'FieldType',
    'The type of data accepted by an entity field.',
    ['string', 'number', 'date', 'datetime', 'time'],
  )
  const gqlFieldMeta = new GraphQLObjectType({
    name: 'FieldMeta',
    description: 'Description (metadata) of an entity field.',
    fields: {
      id: {
        description: 'Unique identifier of the field within the entity',
        type: GraphQLInt,
      },
      name: {
        description: 'Human readable name of the field.',
        type: GraphQLString,
      },
      code: {
        description: 'Key of the field in an entity data JSON',
        type: GraphQLString,
      },
      placeholder: {
        description:
          'A placeholder to show the user when presenting them an entity form.',
        type: GraphQLString,
      },
      type: {
        description: gqlFieldType.description,
        type: gqlFieldType,
      },
      identifier: {
        description: 'Whether the field is part of the entity identifier.',
        type: GraphQLBoolean,
      },
      hidden: {
        description:
          'Whether the field and its value should be show to the user',
        type: GraphQLBoolean,
      },
    },
  })
  const gqlEntityTitleFormat = new GraphQLObjectType({
    name: 'EntityTitleFormat',
    description: trimMargin`
      |Formatting pattern to generate title and subtitle for an entity.
      |
      |The pattern includes references to entity fields in the format
      |  \`#{<field_code>}\`
      |which should be replaced by the value of the indicated field.
      |
      |Ex:
      |  \`\`\`js
      |    {
      |      title: \`#{first_name} #{last_name}\`,
      |      subtitle: \`#{first_name} #{middle_name} #{last_name}\`,
      |    }
      |  \`\`\`
    `,
    fields: {
      title: { type: GraphQLString },
      subtitle: { type: GraphQLString },
    },
  })
  const gqlEntityMeta = new GraphQLObjectType({
    name: 'EntityMeta',
    description: 'Description (metadata) of an entity.',
    fields: {
      id: {
        description: 'Unique identifier of the entity.',
        type: GraphQLInt,
      },
      name: {
        description: 'Human readable name of the entity.',
        type: GraphQLString,
      },
      code: {
        description: 'Unique code of the entity.',
        type: GraphQLString,
      },
      titleFormat: {
        description: gqlEntityTitleFormat.description,
        type: gqlEntityTitleFormat,
      },
      fields: {
        description: 'All the fields that compose the entity.',
        type: new GraphQLList(gqlFieldMeta),
      },
    },
  })

  const gqlQuery = new GraphQLObjectType<void, Context>({
    name: 'Query',
    fields: {
      entityTypes: {
        type: new GraphQLList(gqlEntityMeta),
        async resolve(source, params, { dataDomain }) {
          return (await dataDomain.entityTypes()).map((value) => ({
            ...value,
            fields: Object.values(value.fields),
          }))
        },
      },
      entities: {
        type: new GraphQLList(GraphQLJSONObject),
        args: {
          entityType: { type: GraphQLString },
        },
        // TODO Report and translate internal errors
        // Implementation details should not be exposed in the GraphQL interface
        resolve(source, { entityType }, { dataDomain }) {
          return dataDomain.read(entityType)
        },
      },
    },
  })

  const gqlMutation = new GraphQLObjectType<void, Context>({
    name: 'Mutation',
    // TODO GQL mutation branch factory utility
    fields: {
      entityUpdate: {
        type: GraphQLJSONObject,
        args: {
          entityTypeCode: { type: GraphQLString },
          data: { type: GraphQLJSONObject },
        },
        resolve(source, { entityTypeCode, data }, { dataDomain }) {
          return dataDomain.update(entityTypeCode, data)
        },
      },
    },
  })

  return new GraphQLSchema({ query: gqlQuery, mutation: gqlMutation })
}
