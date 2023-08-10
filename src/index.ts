import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import {
  GraphQLInt, GraphQLList, GraphQLObjectType, GraphQLSchema, GraphQLString,
} from 'graphql'
import { createHandler } from 'graphql-http/lib/use/express'

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
  // TODO: Decouple from the Authorization niche.
  const user = new GraphQLObjectType({
    name: 'User',
    fields: {
      id: { type: GraphQLInt },
      firstName: { type: GraphQLString },
      middleName: { type: GraphQLString },
      lastName: { type: GraphQLString },
      birthDate: { type: GraphQLString },
    },
  })

  const query = new GraphQLObjectType({
    name: 'Query',
    fields: {
      users: {
        type: new GraphQLList(user),
        resolve: () => db.users(),
      },
    },
  })

  return new GraphQLSchema({ query })
}
