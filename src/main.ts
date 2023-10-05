import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import { createHandler } from 'graphql-http/lib/use/express'

import { DataDomain, createMetaDB } from './dataDomain'
import { Database } from './db/sqlite3.promises'
import { populateDB } from './exampleDataDomain'
import { schema } from './gql'

export default async function main() {
  try {
    const metaDB = await Database.connect(':memory:')
    await createMetaDB(metaDB)

    const domainDB = await Database.connect(':memory:')
    if (process.env.CREATE_EXAMPLE_DATA_DOMAIN === 'TRUE') {
      await populateDB(domainDB)
    }

    const dataDomain = new DataDomain(metaDB, domainDB)
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

