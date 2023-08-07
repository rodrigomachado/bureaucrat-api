import cors from 'cors'
import express from 'express'
import { GraphQLObjectType, GraphQLSchema, GraphQLString } from 'graphql'
import { createHandler } from 'graphql-http/lib/use/express'

const app = express()
const port = 4000

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.all('/api', createHandler({ schema: schema() }))

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})

function schema(): GraphQLSchema {
  return new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'Query',
      fields: {
        hello: {
          type: GraphQLString,
          resolve: () => 'Hello GraphQL!!',
        },
      },
    }),
  })
}
