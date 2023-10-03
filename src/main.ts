import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import { createHandler } from 'graphql-http/lib/use/express'

import { DataDomain } from './dataDomain'
import { schema } from './gql'

export default async function main() {
  try {
    const dataDomain = new DataDomain()
    const app = express()

    app.use(cors())
    app.use(express.json())
    app.use(express.urlencoded({ extended: true }))

    app.all('/api', createHandler({
      schema: schema(),
      context: { dataDomain },
    }))

    const port = process.env.PORT
    app.listen(port, () => {
      console.log(`API running at http://localhost:${port}/api`)
    })
  } catch (err) {
    console.error(err)
  }
}

