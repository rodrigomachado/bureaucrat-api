import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import {
  GraphQLBoolean, GraphQLEnumType, GraphQLInt,
  GraphQLList, GraphQLObjectType, GraphQLSchema, GraphQLString,
} from 'graphql'
import { createHandler } from 'graphql-http/lib/use/express'
import { GraphQLJSONObject } from 'graphql-type-json'

import Database from './db'

main()

async function main() {
  try {
    const db = new Database()
    const app = express()

    app.use(cors())
    app.use(express.json())
    app.use(express.urlencoded({ extended: true }))

    app.all('/api', createHandler({ schema: schema(db) }))

    const port = process.env.PORT
    app.listen(port, () => {
      console.log(`API running at http://localhost:${port}/api`)
    })
  } catch (err) {
    console.error(err)
  }
}

/**
 * Creates the GraphQL schema.
 */
function schema(db: Database): GraphQLSchema {
  // TODO GQL documentation (descriptions)

  const gqlFieldType = new GraphQLEnumType({
    name: 'FieldType',
    values: {
      STRING: { value: 'string' },
      NUMBER: { value: 'number' },
      DATE: { value: 'date' },
      DATE_TIME: { value: 'datetime' },
      TIME: { value: 'time' },
    },
  })
  const gqlFieldMeta = new GraphQLObjectType({
    name: 'FieldMeta',
    // TODO Change to { [fieldName]: FieldConfig } type?
    fields: {
      id: { type: GraphQLInt },
      name: { type: GraphQLString },
      displayName: { type: GraphQLString },
      placeholder: { type: GraphQLString },
      type: { type: gqlFieldType },
      hidden: { type: GraphQLBoolean },
    },
  })
  const gqlEntityTitleFormat = new GraphQLObjectType({
    name: 'EntityTitleFormat',
    fields: {
      title: { type: new GraphQLList(GraphQLString) },
      subtitle: { type: new GraphQLList(GraphQLString) },
    },
  })
  const gqlEntityMeta = new GraphQLObjectType({
    name: 'EntityMeta',
    fields: {
      id: { type: GraphQLInt },
      name: { type: GraphQLString },
      identifierFieldName: { type: GraphQLString },
      titleFormat: { type: gqlEntityTitleFormat },
      fields: { type: new GraphQLList(gqlFieldMeta) },
    }
  })

  const gqlQuery = new GraphQLObjectType({
    name: 'Query',
    fields: {
      entityTypes: {
        type: new GraphQLList(gqlEntityMeta),
        // TODO Inspect DB for entities
        resolve: () => ([{
          id: 0,
          name: 'User',
          identifierFieldName: 'id',
          titleFormat: {
            title: ['firstName', 'lastName'],
            subtitle: ['firstName', 'middleName', 'lastName'],
          },
          fields: [
            // TODO Represent field types with a TS Enum
            newField(0, 'id', 'number', true),
            newField(1, 'firstName', 'string', false, 'First Name', 'Douglas'),
            newField(2, 'middleName', 'string', false, 'Middle Name', 'Noël'),
            newField(3, 'lastName', 'string', false, 'Last Name', 'Adams'),
            newField(4, 'birthDate', 'date', false, 'Birth Date', '1952-03-11'),
          ]
        }, {
          id: 1,
          name: 'Feature',
          identifierFieldName: 'id',
          titleFormat: {
            title: ['name'],
            subtitle: ['path', 'name'],
          },
          fields: [
            newField(0, 'id', 'number', true),
            newField(1, 'name', 'string', false, 'Name', 'CreateUser'),
            newField(2, 'path', 'string', false, 'Path', 'user'),
          ],
        }])
      },
      entities: {
        type: new GraphQLList(GraphQLJSONObject),
        args: {
          entityType: { type: GraphQLString },
        },
        // TODO Decouple from Example Data Domain
        resolve(source, { entityType }) {
          switch (entityType) {
            // TODO Translate internal errors
            // Implementation details should not be exposed in the GraphQL interface
            case 'User': return db.users()
            case 'Feature': return db.features()
          }
          throw new Error(`Unknown entity type '${entityType}`)
        },
      },
    },
  })
  function newField(
    id: number, name: string, type: string, hidden: boolean, displayName?: string, placeholder?: string,
  ) {
    return { id, name, type, hidden, displayName, placeholder }
  }

  return new GraphQLSchema({ query: gqlQuery })
}
