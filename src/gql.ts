import {
  GraphQLBoolean, GraphQLList, GraphQLObjectType, GraphQLSchema, GraphQLString,
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
      code: {
        description: 'Unique identifier of the field within the entity',
        type: GraphQLString,
      },
      name: {
        description: 'Human readable name of the field.',
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
      mandatory: {
        description: 'Whether the field is mandatory or not. Mandatory ' +
          'fields cannot be empty when creating a new entity or updating an ' +
          'existing one.\n' +
          'Note that generated fields will be generated while creating a ' +
          'new entity.',
        type: GraphQLBoolean,
      },
      generated: {
        description: 'Whether the field is auto generated during entity ' +
          'creation or not.',
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
      code: {
        description: 'Unique identifier of the entity',
        type: GraphQLString,
      },
      name: {
        description: 'Human readable name of the entity.',
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
          return dataDomain.entityTypes()
        },
      },
      entities: {
        type: new GraphQLList(GraphQLJSONObject),
        args: {
          entityType: { type: GraphQLString },
        },
        async resolve(source, { entityType }, { dataDomain }) {
          return dataDomain.read(entityType)
        },
      },
    },
  })

  const gqlMutation = new GraphQLObjectType<void, Context>({
    name: 'Mutation',
    fields: {
      entityCreate: {
        description: 'Creates a new entity of a given type.',
        type: GraphQLJSONObject,
        args: {
          entityTypeCode: { type: GraphQLString },
          data: { type: GraphQLJSONObject },
        },
        async resolve(source, { entityTypeCode, data }, { dataDomain }) {
          return dataDomain.create(entityTypeCode, data)
        },
      },
      entityUpdate: {
        description: trimMargin`
          |Updates an entity of a given type.
          |
          |The data field must contain a value for every identifier field 
          |defined in the entity type and at least one field to be updated.
        `,
        type: GraphQLJSONObject,
        args: {
          entityTypeCode: { type: GraphQLString },
          data: { type: GraphQLJSONObject },
        },
        async resolve(source, { entityTypeCode, data }, { dataDomain }) {
          return dataDomain.update(entityTypeCode, data)
        },
      },
      entityDelete: {
        description: trimMargin`
          |Deletes an entity of a given entity type.
          |
          |The id object provided must define a value for every identifier field
          |defined in the entity type. Additional fields may be provided by
          |they are ignored.
        `,
        type: GraphQLJSONObject,
        args: {
          entityTypeCode: { type: GraphQLString },
          id: { type: GraphQLJSONObject },
        },
        async resolve(source, { entityTypeCode, id }, { dataDomain }) {
          await dataDomain.delete(entityTypeCode, id)
          return id
        },
      },
    },
  })

  return new GraphQLSchema({ query: gqlQuery, mutation: gqlMutation })
}
