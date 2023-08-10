import sqlite3 from 'sqlite3'
import { toCamelCaseFields } from '../jsext/objects'

// TODO: Convert this module into an Authorization Example Data Souce.
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
  private _db?: sqlite3.Database

  async users(): Promise<User[]> {
    const db = await this.db()
    const users: any[] = await new Promise((res, rej) => {
      // TODO: Promisify sqlite3
      db.all('SELECT * FROM users', (err, rows) => {
        if (err) rej(err)
        res(rows)
      })
    })

    // TODO: Parse/validate User shape?
    return users.map(u => toCamelCaseFields(u) as User)
  }

  /**
   * Lazy loads the database connection.
   * It also creates the schema and populates the data.
   */
  private async db(): Promise<sqlite3.Database> {
    if (this._db) return Promise.resolve(this._db)

    this._db = await new Promise<sqlite3.Database>((res, rej) => {
      const db = new sqlite3.Database(':memory:', err => {
        if (err) rej(err)
        res(db)
      })
    })

    await create_schema(this._db)
    await populate_data(this._db)

    return this._db
  }
}

async function create_schema(db: sqlite3.Database): Promise<void> {
  return new Promise((res, rej) => {
    db.run(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT,
        middle_name TEXT,
        last_name TEXT,
        birth_date TEXT
      )
    `, err => {
      if (err) rej(err)
      res()
    })
  })
}

async function populate_data(db: sqlite3.Database) {
  const addUser = (
    firstName: string, middleName: string, lastName: string, birthDate: string
  ) => new Promise<void>((res, rej) => {
    db.run(`
      INSERT INTO users (first_name, middle_name, last_name, birth_date)
      VALUES (?, ?, ?, ?)
    `, [firstName, middleName, lastName, birthDate], err => {
      if (err) rej(err)
      res()
    })
  })

  await addUser('John', 'Quincy', 'Adams', '1767-07-11')
  await addUser('George', '', 'Washington', '1732-02-22')
  await addUser('Thomas', '', 'Jefferson', '1743-04-13')
}
