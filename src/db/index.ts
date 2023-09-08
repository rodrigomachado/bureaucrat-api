import * as sql3 from './sqlite3.promises'
import { toCamelCaseFields } from '../jsext/objects'

// TODO: Extract from this module an Authorization Example Data Domain.
//
// This data source should be useful for development: an easy and disposable
// database to rapidly get the app running in a new dev env. It should also be
// useful for testing.
//
// In the context of the Bureaucrat app, data sources are manageable CRUD
// interfaces (or CRUD like), such as a SQL database, a REST API, a
// GraphQL API, or anything mappable in some way to the DataSource
// interface (yet to be defined).

export type User = {
  id: number
  firstName: string
  middleName: string
  lastName: string
  birthDate: string
}

export default class Database {
  private _db?: Promise<sql3.Database>

  async users(): Promise<User[]> {
    const db = await this.db()
    const users = await db.all('SELECT * FROM users')

    // TODO: Parse/validate User shape?
    return users.map(u => toCamelCaseFields(u) as User)
  }

  /**
   * Lazy loads the database connection.
   * It also creates the schema and populates the data.
   */
  private async db(): Promise<sql3.Database> {
    if (this._db) return this._db

    this._db = (async () => {
      const db = await sql3.Database.connect(':memory:')
      await create_schema(db)
      await populate_data(db)
      return db
    })()

    return this._db
  }
}

async function create_schema(db: sql3.Database): Promise<void> {
  await db.run(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT,
      middle_name TEXT,
      last_name TEXT,
      birth_date TEXT
    )
  `)
}

async function populate_data(db: sql3.Database) {
  const addUser = async (
    firstName: string, middleName: string, lastName: string, birthDate: string
  ) => (
    await db.run(`
      INSERT INTO users (first_name, middle_name, last_name, birth_date)
      VALUES (?, ?, ?, ?)
    `, [firstName, middleName, lastName, birthDate])
  )
  await addUser('Douglas', 'Noël', 'Adams', '1767-07-11')
  await addUser('John', 'Marwood', 'Cleese', '1939-10-27')
  await addUser('Rowan', 'Sebastian', 'Atkinson', '1955-01-06')
  await addUser('Isaac', '', 'Asimov', '1920-01-02')
  await addUser('Mary', 'Wollstonecraft', 'Shelley', '1797-08-30')
}
