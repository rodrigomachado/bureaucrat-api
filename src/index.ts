import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import {
  GraphQLEnumType,
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
      name: { type: GraphQLString },
      type: { type: gqlFieldType },
    },
  })
  const gqlEntityMeta = new GraphQLObjectType({
    name: 'EntityMeta',
    fields: {
      name: { type: GraphQLString },
      identifierFieldName: { type: GraphQLString },
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
          name: 'User',
          identifierFieldName: 'id',
          fields: [
            // TODO Represent field types with a TS Enum
            { name: 'id', type: 'number' },
            { name: 'firstName', type: 'string' },
            { name: 'middleName', type: 'string' },
            { name: 'lastName', type: 'string' },
            { name: 'birthDate', type: 'date' },
          ]
        }])
      },
      entities: {
        type: new GraphQLList(GraphQLJSONObject),
        args: {
          entityType: { type: GraphQLString },
        },
        // TODO Decouple from Example Data Domain
        resolve: () => db.users(),
      },
    },
  })

  return new GraphQLSchema({ query: gqlQuery })
}
