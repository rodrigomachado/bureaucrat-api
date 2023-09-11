import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import {
  GraphQLBoolean, GraphQLEnumType, GraphQLInt,
  GraphQLList, GraphQLObjectType, GraphQLSchema, GraphQLString,
} from 'graphql'
import { createHandler } from 'graphql-http/lib/use/express'
import { GraphQLJSONObject } from 'graphql-type-json'

import { Database } from './db'

export default async function main() {
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
        // TODO Inspect DB for entities
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
        // TODO Decouple from Example Data Domain
        resolve(source, { entityType }) {
          switch (entityType) {
            // TODO Report and translate internal errors
            // Implementation details should not be exposed in the GraphQL interface
            case 'users': return db.users()
            case 'features': return db.features()
          }
          throw new Error(`Unknown entity type '${entityType}'`)
        },
      },
    },
  })

  return new GraphQLSchema({ query: gqlQuery })
}
